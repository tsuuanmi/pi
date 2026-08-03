import type { TeamOrchestratorOutput } from "#workflows/skills/team/orchestrator";
import type { TeamSnapshot, TeamTask } from "#workflows/skills/team/runtime";

export function applyTeamExecution(snapshot: TeamSnapshot, output: TeamOrchestratorOutput): TeamSnapshot {
	const updates = new Map(output.taskUpdates.map((update) => [update.id, update]));
	if (updates.size !== output.taskUpdates.length) throw new Error("duplicate team execution task update");
	for (const update of output.taskUpdates) {
		if (!snapshot.tasks.some((task) => task.id === update.id)) {
			throw new Error(`team execution update targets unknown task: ${update.id}`);
		}
	}
	const receiptIds = new Map<string, string[]>();
	for (const receipt of output.receiptRefs) {
		const ids = receiptIds.get(receipt.task_id) ?? [];
		ids.push(receipt.id);
		receiptIds.set(receipt.task_id, ids);
	}

	const tasks = snapshot.tasks.map((task) => {
		const update = updates.get(task.id);
		if (!update) return task;
		const execution = update.execution;
		if (!execution) throw new Error(`team execution update has no execution state: ${task.id}`);
		return {
			...task,
			execution: {
				...execution,
				receipt_ids: receiptIds.get(task.id) ?? [],
			},
		} satisfies TeamTask;
	});

	const updatedAt = tasks.reduce(
		(latest, task) => (task.execution && task.execution.updated_at > latest ? task.execution.updated_at : latest),
		snapshot.updated_at,
	);
	return {
		...snapshot,
		tasks,
		updated_at: updatedAt,
	};
}
