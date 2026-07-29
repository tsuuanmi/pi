import type { OrchestratorRunContext } from "#agent/orchestrator/context";
import type { Task, TaskQueue } from "#agent/task/task";
import type { Team } from "#agent/team/team";

export function assertTeamCanRun(team: Team): void {
	if (team.getAgents().length === 0) throw new Error("Cannot run a team without agents.");
}

export function assertKnownAssignees(queue: TaskQueue, team: Team): void {
	const roster = new Set(team.getAgents().map((agent) => agent.name));
	const invalid = queue
		.snapshots()
		.filter((task) => task.assignee !== undefined && !roster.has(task.assignee))
		.map((task) => `${task.id} -> ${task.assignee}`);
	if (invalid.length > 0) {
		throw new Error(`Invalid task assignee(s): ${invalid.join(", ")}`);
	}
}

export async function approveTaskDispatch(task: Task, context: OrchestratorRunContext): Promise<boolean> {
	if (!context.options.onTaskDispatch) return true;
	const snapshot = task.snapshot();
	try {
		const approved = await context.options.onTaskDispatch(snapshot);
		context.emitTrace({
			type: "task_dispatch",
			runStatus: context.aborted ? "aborted" : "running",
			taskId: snapshot.id,
			taskTitle: snapshot.title,
			message: approved ? "Task dispatch approved." : "Task dispatch rejected.",
			data: { approved },
		});
		if (approved) return true;
		const message = `Task dispatch rejected: ${snapshot.id}`;
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
		const message = error instanceof Error ? error.message : String(error);
		context.abort(`Task dispatch gate failed: ${message}`);
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
		return false;
	}
}

export function skipPendingTasks(queue: TaskQueue, context: OrchestratorRunContext, reason: string): void {
	for (const task of queue.list()) {
		if (task.status !== "pending") continue;
		task.skip(reason);
		const snapshot = task.snapshot();
		const timestamp = Date.now();
		context.recordTaskMetrics(snapshot, timestamp, timestamp);
		context.emit({
			type: "task_skipped",
			taskId: snapshot.id,
			taskTitle: snapshot.title,
			message: reason,
		});
		context.emitTrace({
			type: "task_skipped",
			runStatus: context.aborted ? "aborted" : "running",
			taskId: snapshot.id,
			taskTitle: snapshot.title,
			message: reason,
		});
	}
}

export function blockUnreachableTasks(queue: TaskQueue): void {
	for (const task of queue.list()) {
		if (task.status === "pending") {
			task.block("Task is not reachable because its dependencies form a cycle or cannot be scheduled.");
		}
	}
}
