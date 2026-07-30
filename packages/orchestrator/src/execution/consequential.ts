import type { OrchestratorRunContext } from "#orchestrator/runtime/context";
import type { Task } from "#orchestrator/task/task";

export async function approveConsequentialTask(task: Task, context: OrchestratorRunContext): Promise<boolean> {
	const snapshot = task.snapshot();
	if (!snapshot.consequential) return true;
	const approver = context.options.onTaskConsequential ?? context.defaultOnTaskConsequential;
	if (!approver) {
		context.recordTaskConsequential(snapshot.id, { required: true, approved: false });
		const message = `Consequential task requires explicit approval: ${snapshot.id}`;
		context.abort(message);
		task.skip(message);
		const skipped = task.snapshot();
		const timestamp = Date.now();
		context.recordTaskMetrics(skipped, timestamp, timestamp);
		context.emit({
			type: "task_consequential",
			taskId: skipped.id,
			taskTitle: skipped.title,
			message,
			data: { approved: false },
		});
		context.emitTrace({
			type: "task_consequential",
			runStatus: context.aborted ? "aborted" : "running",
			taskId: skipped.id,
			taskTitle: skipped.title,
			message,
			data: { approved: false },
		});
		context.emit({
			type: "task_skipped",
			taskId: skipped.id,
			taskTitle: skipped.title,
			message,
		});
		return false;
	}
	try {
		const approved = await approver(snapshot);
		context.recordTaskConsequential(snapshot.id, { required: true, approved });
		context.emit({
			type: "task_consequential",
			taskId: snapshot.id,
			taskTitle: snapshot.title,
			message: approved ? "Consequential task approved." : "Consequential task rejected.",
			data: { approved },
		});
		context.emitTrace({
			type: "task_consequential",
			runStatus: context.aborted ? "aborted" : "running",
			taskId: snapshot.id,
			taskTitle: snapshot.title,
			message: approved ? "Consequential task approved." : "Consequential task rejected.",
			data: { approved },
		});
		if (approved) return true;
		const message = `Consequential task rejected: ${snapshot.id}`;
		context.abort(message);
		task.skip(message);
		const skipped = task.snapshot();
		const timestamp = Date.now();
		context.recordTaskMetrics(skipped, timestamp, timestamp);
		context.emit({
			type: "task_skipped",
			taskId: skipped.id,
			taskTitle: skipped.title,
			message,
		});
		return false;
	} catch (error) {
		context.recordTaskConsequential(snapshot.id, { required: true, approved: false });
		const message = error instanceof Error ? error.message : String(error);
		context.abort(`Consequential task approval failed: ${message}`);
		task.skip(context.abortedReason ?? message);
		const skipped = task.snapshot();
		const timestamp = Date.now();
		context.recordTaskMetrics(skipped, timestamp, timestamp);
		context.emit({
			type: "error",
			taskId: skipped.id,
			taskTitle: skipped.title,
			message,
			data: error,
		});
		context.emitTrace({
			type: "error",
			runStatus: context.aborted ? "aborted" : "running",
			taskId: skipped.id,
			taskTitle: skipped.title,
			message,
			data: error,
		});
		context.emit({
			type: "task_skipped",
			taskId: skipped.id,
			taskTitle: skipped.title,
			message: context.abortedReason ?? message,
		});
		return false;
	}
}
