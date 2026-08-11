import type { FailureResolution } from "#orchestrator/execution/events";
import { emitShortCircuitTrace } from "#orchestrator/execution/events";
import type { OrchestratorRunContext } from "#orchestrator/runtime/context";
import type { Task } from "#orchestrator/task/task";
import type { TaskSnapshot } from "#orchestrator/task/types";
import type { TaskFailureAction, TaskFailureContext, TaskRetryClassification } from "#orchestrator/types";

interface FailureInput {
	task: Task;
	context: OrchestratorRunContext;
	agent: string;
	error: unknown;
	output: string;
	structured?: unknown;
	completedDependencies: readonly TaskSnapshot[];
	attempt: number;
}

export async function classifyRetry(input: FailureInput): Promise<TaskRetryClassification | undefined> {
	const classifier = input.context.options.onTaskRetryClassify ?? input.context.defaultOnTaskRetryClassify;
	if (!classifier) return undefined;
	const snapshot = input.task.snapshot();
	try {
		return await classifier(createFailureContext(input, snapshot));
	} catch (error) {
		emitHookError(input.context, snapshot, input.agent, error);
		return undefined;
	}
}

export async function resolveFailure(
	input: FailureInput & { defaultAction: TaskFailureAction },
): Promise<FailureResolution> {
	const handler = input.context.options.onTaskFailure ?? input.context.defaultOnTaskFailure;
	if (!handler) return { action: input.defaultAction, shortCircuit: false };
	const snapshot = input.task.snapshot();
	try {
		const action = await handler(createFailureContext(input, snapshot));
		if (!isFailureAction(action)) return { action: input.defaultAction, shortCircuit: false };
		return { action, shortCircuit: action !== input.defaultAction };
	} catch (error) {
		emitHookError(input.context, snapshot, input.agent, error);
		return { action: input.defaultAction, shortCircuit: false };
	}
}

export async function finishFailure(input: {
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
		input.context.queue.emit({ type: "task_skip", task: skipped, message: input.message });
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
	input.context.queue.emit({ type: "task_fail", task: failed, message: input.message });
	if (input.resolution.action === "abort") input.context.abort(input.message);
	input.context.emit({
		type: "error",
		taskId: failed.id,
		taskTitle: failed.title,
		agent: input.agent,
		message: input.message,
		data: { attempts: failed.attempts },
	});
	if (input.resolution.shortCircuit) {
		emitShortCircuitTrace(input.context, failed, input.agent, input.message, input.resolution);
	} else {
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

function createFailureContext(input: FailureInput, task: TaskSnapshot): TaskFailureContext {
	return {
		task,
		team: input.context.team,
		completedDependencies: input.completedDependencies,
		attempt: input.attempt,
		agent: input.agent,
		error: input.error,
		output: input.output,
		structured: input.structured,
	};
}

function emitHookError(context: OrchestratorRunContext, task: TaskSnapshot, agent: string, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	context.emitTrace({
		type: "error",
		runStatus: context.aborted ? "aborted" : "running",
		taskId: task.id,
		taskTitle: task.title,
		agent,
		message,
		data: error,
	});
}

function isFailureAction(value: unknown): value is TaskFailureAction {
	return value === "retry" || value === "fail" || value === "skip" || value === "abort";
}
