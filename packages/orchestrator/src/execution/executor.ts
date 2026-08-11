import { approveConsequentialTask } from "#orchestrator/execution/consequential";
import { emitTaskError, skipTask } from "#orchestrator/execution/events";
import { classifyRetry, finishFailure, resolveFailure } from "#orchestrator/execution/failure";
import { toTaskResult } from "#orchestrator/execution/result";
import {
	computeRetryDecision,
	formatFailureMessage,
	isAbortError,
	resolveRetryBackoff,
	resolveRetryCount,
	resolveRetryDelay,
	wait,
} from "#orchestrator/execution/retry";
import { verifyTask } from "#orchestrator/execution/verification";
import { emitBudgetExceeded, isRunBudgetExceeded } from "#orchestrator/runtime/budget";
import type { OrchestratorRunContext } from "#orchestrator/runtime/context";
import { formatTaskPrompt } from "#orchestrator/task/prompt";
import type { TaskQueue } from "#orchestrator/task/queue";
import type { Task } from "#orchestrator/task/task";
import type { TaskSnapshot } from "#orchestrator/task/types";

export async function executeTask(task: Task, queue: TaskQueue, context: OrchestratorRunContext): Promise<void> {
	const startedAtMs = Date.now();
	const initialSnapshot = task.snapshot();
	const agent = context.team.getAgent(initialSnapshot.assignee ?? "");
	if (!agent) {
		const message = `Unknown assignee: ${initialSnapshot.assignee ?? "unassigned"}`;
		task.fail(message);
		const failed = task.snapshot();
		queue.emit({ type: "task_fail", task: failed, message });
		emitTaskError(context, failed, message);
		context.recordTaskMetrics(failed, startedAtMs, Date.now());
		await context.saveCheckpoint("running");
		return;
	}
	const maxRetries = resolveRetryCount(initialSnapshot.maxRetries);
	const retryDelayMs = resolveRetryDelay(initialSnapshot.retryDelayMs);
	const retryBackoff = resolveRetryBackoff(initialSnapshot.retryBackoff);

	while (true) {
		const budgetExceeded = isRunBudgetExceeded(context);
		if (budgetExceeded) {
			const alreadyEmitted = context.abortedReason === budgetExceeded;
			context.abort(budgetExceeded);
			if (!alreadyEmitted) emitBudgetExceeded(context, budgetExceeded);
			skipTask(task, context, budgetExceeded, startedAtMs);
			await context.saveCheckpoint("aborted");
			return;
		}

		if (context.aborted) {
			skipTask(task, context, context.abortedReason ?? "Run aborted.", startedAtMs);
			await context.saveCheckpoint("aborted");
			return;
		}

		if (!(await approveConsequentialTask(task, queue, context))) {
			await context.saveCheckpoint("aborted");
			return;
		}

		context.recordTaskStart();
		task.start();
		const attemptSnapshot = task.snapshot();
		queue.emit({ type: "task_start", task: attemptSnapshot });
		context.options.onTaskStart?.(attemptSnapshot);
		context.emit({
			type: "task_start",
			taskId: attemptSnapshot.id,
			taskTitle: attemptSnapshot.title,
			agent: agent.name,
			data: { attempt: attemptSnapshot.attempts },
		});
		context.emitTrace({
			type: "task_start",
			runStatus: context.aborted ? "aborted" : "running",
			taskId: attemptSnapshot.id,
			taskTitle: attemptSnapshot.title,
			agent: agent.name,
			data: { attempt: attemptSnapshot.attempts },
		});
		const completedDependencies = attemptSnapshot.dependsOn
			.map((id) => queue.get(id)?.snapshot())
			.filter((dependency): dependency is TaskSnapshot => dependency?.status === "completed");
		const prompt = formatTaskPrompt({ task: attemptSnapshot, completedDependencies });
		let result: { success: boolean; output: string; structured?: unknown; error?: unknown };
		try {
			result = await agent.run(prompt, {
				signal: context.executionSignal,
				metadata: { taskId: attemptSnapshot.id, attempt: attemptSnapshot.attempts },
			});
		} catch (error) {
			result = {
				success: false,
				output: "",
				error,
			};
		}

		if (context.aborted || isAbortError(result.error)) {
			context.abort(context.abortedReason ?? "Run aborted by abort signal.");
			skipTask(task, context, context.abortedReason ?? "Run aborted.", startedAtMs);
			await context.saveCheckpoint("aborted");
			return;
		}

		if (result.success) {
			const bridgeResult = toTaskResult(result);
			const verified = await verifyTask({
				task,
				queue,
				context,
				agent: agent.name,
				output: bridgeResult.output,
				structured: bridgeResult.structured,
				completedDependencies,
				attempt: attemptSnapshot.attempts,
				startedAtMs,
			});
			if (!verified) {
				await context.saveCheckpoint("running");
				return;
			}
			task.complete(bridgeResult.output, bridgeResult.structured);
			const completed = task.snapshot();
			queue.emit({ type: "task_complete", task: completed });
			context.options.onTaskComplete?.(completed);
			context.emit({
				type: "task_complete",
				taskId: completed.id,
				taskTitle: completed.title,
				agent: agent.name,
				data: { attempts: completed.attempts },
			});
			context.emitTrace({
				type: "task_complete",
				runStatus: context.aborted ? "aborted" : "running",
				taskId: completed.id,
				taskTitle: completed.title,
				agent: agent.name,
				data: { attempts: completed.attempts },
			});
			context.recordTaskMetrics(completed, startedAtMs, Date.now());
			await context.saveCheckpoint("running");
			return;
		}

		const errorMessage = formatFailureMessage(result.error, result.output);
		const resolution = await resolveFailure({
			task,
			context,
			agent: agent.name,
			error: result.error,
			output: result.output,
			structured: result.structured,
			completedDependencies,
			attempt: attemptSnapshot.attempts,
			defaultAction: attemptSnapshot.attempts <= maxRetries ? "retry" : "fail",
		});
		if (resolution.action === "retry") {
			task.retry(errorMessage);
			const retrySnapshot = task.snapshot();
			const retryDecision = computeRetryDecision(retryDelayMs, retryBackoff, attemptSnapshot.attempts);
			const retryClassification = await classifyRetry({
				task,
				context,
				agent: agent.name,
				error: result.error,
				output: result.output,
				structured: result.structured,
				completedDependencies,
				attempt: attemptSnapshot.attempts,
			});
			if (retryClassification !== undefined) {
				context.recordTaskRetryClassification(retrySnapshot, startedAtMs, Date.now(), retryClassification);
			}
			context.emit({
				type: "task_retry",
				taskId: retrySnapshot.id,
				taskTitle: retrySnapshot.title,
				agent: agent.name,
				message: errorMessage,
				data: { retryDecision, ...(retryClassification ? { retryClassification } : {}) },
			});
			context.emitTrace({
				type: "task_retry",
				runStatus: context.aborted ? "aborted" : "running",
				taskId: retrySnapshot.id,
				taskTitle: retrySnapshot.title,
				agent: agent.name,
				message: errorMessage,
				data: { retryDecision, ...(retryClassification ? { retryClassification } : {}) },
			});
			await context.saveCheckpoint("running");
			const delayMs = retryDecision.delayMs;
			try {
				await wait(delayMs, context.executionSignal);
			} catch (error) {
				if (!isAbortError(error)) throw error;
				context.abort("Run aborted by abort signal.");
				skipTask(task, context, context.abortedReason ?? "Run aborted.", startedAtMs);
				await context.saveCheckpoint("aborted");
				return;
			}
			continue;
		}

		await finishFailure({
			task,
			context,
			agent: agent.name,
			message: errorMessage,
			resolution,
			startedAtMs,
		});
		return;
	}
}
