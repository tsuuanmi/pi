import { emitTaskError } from "#orchestrator/execution/events";
import type { OrchestratorRunContext } from "#orchestrator/runtime/context";
import type { TaskQueue } from "#orchestrator/task/queue";
import type { Task } from "#orchestrator/task/task";
import type { TaskSnapshot } from "#orchestrator/task/types";
import type { TaskVerificationContext } from "#orchestrator/types";

export async function verifyTask(input: {
	task: Task;
	queue: TaskQueue;
	context: OrchestratorRunContext;
	agent: string;
	output: string;
	structured: unknown;
	completedDependencies: readonly TaskSnapshot[];
	attempt: number;
	startedAtMs: number;
}): Promise<boolean> {
	const verifier = input.context.options.onTaskVerify ?? input.context.defaultOnTaskVerify;
	if (!verifier || input.task.snapshot().verify === undefined) return true;
	const snapshot = input.task.snapshot();
	const verification: TaskVerificationContext = {
		task: snapshot,
		team: input.context.team,
		completedDependencies: input.completedDependencies,
		attempt: input.attempt,
		agent: input.agent,
		output: input.output,
		structured: input.structured,
	};
	try {
		const approved = await verifier(verification);
		recordVerification(input.context, snapshot, input.agent, approved);
		if (approved) return true;
		failVerification(input, "Task verification failed.");
		return false;
	} catch (error) {
		input.context.recordTaskVerification(snapshot.id, false);
		failVerification(input, error instanceof Error ? error.message : String(error), error);
		return false;
	}
}

function recordVerification(
	context: OrchestratorRunContext,
	task: TaskSnapshot,
	agent: string,
	approved: boolean,
): void {
	context.recordTaskVerification(task.id, approved);
	const message = approved ? "Task verification passed." : "Task verification failed.";
	context.emit({ type: "task_verify", taskId: task.id, taskTitle: task.title, agent, message, data: { approved } });
	context.emitTrace({
		type: "task_verify",
		runStatus: context.aborted ? "aborted" : "running",
		taskId: task.id,
		taskTitle: task.title,
		agent,
		message,
		data: { approved },
	});
}

function failVerification(
	input: {
		task: Task;
		queue: TaskQueue;
		context: OrchestratorRunContext;
		agent: string;
		startedAtMs: number;
	},
	message: string,
	error?: unknown,
): void {
	input.task.fail(message);
	const failed = input.task.snapshot();
	input.queue.emit({ type: "task_fail", task: failed, message });
	emitTaskError(input.context, failed, message, input.agent, error);
	input.context.recordTaskMetrics(failed, input.startedAtMs, Date.now());
}
