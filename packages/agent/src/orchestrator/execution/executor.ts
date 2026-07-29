import { extractTaskBridgeResult, formatTaskPrompt, type Task, type TaskQueue } from "#agent/task/task";
import type { TaskSnapshot } from "#agent/task/types";
import { emitBudgetExceeded, isRunBudgetExceeded } from "../runtime/budget.js";
import type { OrchestratorRunContext } from "../runtime/context.js";
import type {
	TaskFailureAction,
	TaskFailureContext,
	TaskRetryClassification,
	TaskVerificationContext,
} from "../types.js";
import { approveConsequentialTask } from "./consequential.js";
import {
	computeRetryDecision,
	formatFailureMessage,
	isAbortError,
	resolveRetryBackoff,
	resolveRetryCount,
	resolveRetryDelay,
	wait,
} from "./retry.js";

interface FailureResolution {
	action: TaskFailureAction;
	shortCircuit: boolean;
}

export async function executeTask(task: Task, queue: TaskQueue, context: OrchestratorRunContext): Promise<void> {
	const startedAtMs = Date.now();
	const initialSnapshot = task.snapshot();
	const agent = context.team.getAgent(initialSnapshot.assignee ?? "");
	if (!agent) {
		const message = `Unknown assignee: ${initialSnapshot.assignee ?? "unassigned"}`;
		task.fail(message);
		const failed = task.snapshot();
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

		if (!(await approveConsequentialTask(task, context))) {
			await context.saveCheckpoint("aborted");
			return;
		}

		context.recordTaskStart();
		task.start();
		const attemptSnapshot = task.snapshot();
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
			const bridgeResult = extractTaskBridgeResult(result);
			const verified = await verifyTask(
				task,
				context,
				agent.name,
				bridgeResult.output,
				bridgeResult.structured,
				completedDependencies,
				attemptSnapshot.attempts,
				startedAtMs,
			);
			if (!verified) {
				await context.saveCheckpoint("running");
				return;
			}
			task.complete(bridgeResult.output, bridgeResult.structured);
			const completed = task.snapshot();
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
		const resolution = await resolveFailureAction({
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
			const retryClassification = await resolveRetryClassification({
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

		await finalizeFailure({
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

async function resolveRetryClassification(input: {
	task: Task;
	context: OrchestratorRunContext;
	agent: string;
	error: unknown;
	output: string;
	structured?: unknown;
	completedDependencies: readonly TaskSnapshot[];
	attempt: number;
}): Promise<TaskRetryClassification | undefined> {
	const classifier = input.context.options.onTaskRetryClassify ?? input.context.defaultOnTaskRetryClassify;
	if (!classifier) return undefined;
	const snapshot = input.task.snapshot();
	const failureContext: TaskFailureContext = {
		task: snapshot,
		team: input.context.team,
		completedDependencies: input.completedDependencies,
		attempt: input.attempt,
		agent: input.agent,
		error: input.error,
		output: input.output,
		structured: input.structured,
	};
	try {
		return await classifier(failureContext);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		input.context.emitTrace({
			type: "error",
			runStatus: input.context.aborted ? "aborted" : "running",
			taskId: snapshot.id,
			taskTitle: snapshot.title,
			agent: input.agent,
			message,
			data: error,
		});
		return undefined;
	}
}

async function resolveFailureAction(input: {
	task: Task;
	context: OrchestratorRunContext;
	agent: string;
	error: unknown;
	output: string;
	structured?: unknown;
	completedDependencies: readonly TaskSnapshot[];
	attempt: number;
	defaultAction: TaskFailureAction;
}): Promise<FailureResolution> {
	const classifier = input.context.options.onTaskFailure ?? input.context.defaultOnTaskFailure;
	if (!classifier) return { action: input.defaultAction, shortCircuit: false };
	const snapshot = input.task.snapshot();
	const failureContext: TaskFailureContext = {
		task: snapshot,
		team: input.context.team,
		completedDependencies: input.completedDependencies,
		attempt: input.attempt,
		agent: input.agent,
		error: input.error,
		output: input.output,
		structured: input.structured,
	};
	try {
		const action = await classifier(failureContext);
		if (!isTaskFailureAction(action)) return { action: input.defaultAction, shortCircuit: false };
		return { action, shortCircuit: action !== input.defaultAction };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		input.context.emitTrace({
			type: "error",
			runStatus: input.context.aborted ? "aborted" : "running",
			taskId: snapshot.id,
			taskTitle: snapshot.title,
			agent: input.agent,
			message,
			data: error,
		});
		return { action: input.defaultAction, shortCircuit: false };
	}
}

async function finalizeFailure(input: {
	task: Task;
	context: OrchestratorRunContext;
	agent: string;
	message: string;
	resolution: FailureResolution;
	startedAtMs: number;
}): Promise<void> {
	if (input.resolution.action === "skip") {
		input.task.skip(input.message);
		const skipped = input.task.snapshot();
		input.context.emit({
			type: "task_skipped",
			taskId: skipped.id,
			taskTitle: skipped.title,
			agent: input.agent,
			message: input.message,
		});
		emitShortCircuitTrace(input.context, skipped, input.agent, input.message, input.resolution);
		input.context.recordTaskMetrics(skipped, input.startedAtMs, Date.now());
		await input.context.saveCheckpoint("running");
		return;
	}

	input.task.fail(input.message);
	const failed = input.task.snapshot();
	if (input.resolution.action === "abort") input.context.abort(input.message);
	input.context.emit({
		type: "error",
		taskId: failed.id,
		taskTitle: failed.title,
		agent: input.agent,
		message: input.message,
		data: { attempts: failed.attempts },
	});
	if (input.resolution.shortCircuit)
		emitShortCircuitTrace(input.context, failed, input.agent, input.message, input.resolution);
	else {
		input.context.emitTrace({
			type: "error",
			runStatus: input.context.aborted ? "aborted" : "running",
			taskId: failed.id,
			taskTitle: failed.title,
			agent: input.agent,
			message: input.message,
			data: { attempts: failed.attempts },
		});
	}
	input.context.recordTaskMetrics(failed, input.startedAtMs, Date.now());
	await input.context.saveCheckpoint(input.context.aborted ? "aborted" : "running");
}

async function verifyTask(
	task: Task,
	context: OrchestratorRunContext,
	agent: string,
	output: string,
	structured: unknown,
	completedDependencies: readonly TaskSnapshot[],
	attempt: number,
	startedAtMs: number,
): Promise<boolean> {
	const verifier = context.options.onTaskVerify ?? context.defaultOnTaskVerify;
	if (!verifier || task.snapshot().verify === undefined) return true;
	const snapshot = task.snapshot();
	const verificationContext: TaskVerificationContext = {
		task: snapshot,
		team: context.team,
		completedDependencies,
		attempt,
		agent,
		output,
		structured,
	};
	try {
		const approved = await verifier(verificationContext);
		context.recordTaskVerification(snapshot.id, approved);
		context.emit({
			type: "task_verify",
			taskId: snapshot.id,
			taskTitle: snapshot.title,
			agent,
			message: approved ? "Task verification passed." : "Task verification failed.",
			data: { approved },
		});
		context.emitTrace({
			type: "task_verify",
			runStatus: context.aborted ? "aborted" : "running",
			taskId: snapshot.id,
			taskTitle: snapshot.title,
			agent,
			message: approved ? "Task verification passed." : "Task verification failed.",
			data: { approved },
		});
		if (!approved) {
			task.fail("Task verification failed.");
			const failed = task.snapshot();
			emitTaskError(context, failed, "Task verification failed.", agent);
			context.recordTaskMetrics(failed, startedAtMs, Date.now());
			return false;
		}
		return true;
	} catch (error) {
		context.recordTaskVerification(snapshot.id, false);
		const message = error instanceof Error ? error.message : String(error);
		task.fail(message);
		const failed = task.snapshot();
		emitTaskError(context, failed, message, agent, error);
		context.recordTaskMetrics(failed, startedAtMs, Date.now());
		return false;
	}
}

function skipTask(task: Task, context: OrchestratorRunContext, reason: string, startedAtMs: number): void {
	task.skip(reason);
	const skipped = task.snapshot();
	context.emit({
		type: "task_skipped",
		taskId: skipped.id,
		taskTitle: skipped.title,
		message: reason,
	});
	context.emitTrace({
		type: "task_skipped",
		runStatus: context.aborted ? "aborted" : "running",
		taskId: skipped.id,
		taskTitle: skipped.title,
		message: reason,
	});
	context.recordTaskMetrics(skipped, startedAtMs, Date.now());
}

function emitTaskError(
	context: OrchestratorRunContext,
	task: TaskSnapshot,
	message: string,
	agent?: string,
	data?: unknown,
): void {
	context.emit({
		type: "error",
		taskId: task.id,
		taskTitle: task.title,
		...(agent ? { agent } : {}),
		message,
		...(data !== undefined ? { data } : {}),
	});
	context.emitTrace({
		type: "error",
		runStatus: context.aborted ? "aborted" : "running",
		taskId: task.id,
		taskTitle: task.title,
		...(agent ? { agent } : {}),
		message,
		...(data !== undefined ? { data } : {}),
	});
}

function emitShortCircuitTrace(
	context: OrchestratorRunContext,
	task: TaskSnapshot,
	agent: string,
	message: string,
	resolution: FailureResolution,
): void {
	context.emitTrace({
		type: "task_short_circuit",
		runStatus: context.aborted ? "aborted" : "running",
		taskId: task.id,
		taskTitle: task.title,
		agent,
		message,
		data: { action: resolution.action },
	});
}

function isTaskFailureAction(value: unknown): value is TaskFailureAction {
	return value === "retry" || value === "fail" || value === "skip" || value === "abort";
}
