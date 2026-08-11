import type { OrchestratorRunContext } from "#orchestrator/runtime/context";
import type { Task } from "#orchestrator/task/task";
import type { TaskSnapshot } from "#orchestrator/task/types";
import type { TaskFailureAction } from "#orchestrator/types";

export interface FailureResolution {
	action: TaskFailureAction;
	shortCircuit: boolean;
}

export function skipTask(task: Task, context: OrchestratorRunContext, reason: string, startedAtMs: number): void {
	task.skip(reason);
	const skipped = task.snapshot();
	context.queue.emit({ type: "task_skip", task: skipped, message: reason });
	context.emit({ type: "task_skipped", taskId: skipped.id, taskTitle: skipped.title, message: reason });
	context.emitTrace({
		type: "task_skipped",
		runStatus: context.aborted ? "aborted" : "running",
		taskId: skipped.id,
		taskTitle: skipped.title,
		message: reason,
	});
	context.recordTaskMetrics(skipped, startedAtMs, Date.now());
}

export function emitTaskError(
	context: OrchestratorRunContext,
	task: TaskSnapshot,
	message: string,
	agent?: string,
	data?: unknown,
): void {
	const event = {
		type: "error" as const,
		taskId: task.id,
		taskTitle: task.title,
		...(agent ? { agent } : {}),
		message,
		...(data !== undefined ? { data } : {}),
	};
	context.emit(event);
	context.emitTrace({ ...event, runStatus: context.aborted ? "aborted" : "running" });
}

export function emitShortCircuitTrace(
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
