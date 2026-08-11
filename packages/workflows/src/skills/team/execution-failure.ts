import type { TeamTaskReceiptRef } from "#workflows/skills/team/receipt-mapper";
import type { TeamSnapshot, TeamTask } from "#workflows/skills/team/types";

export function applyExecutionFailure(
	snapshot: TeamSnapshot,
	taskIds: readonly string[],
	error: string,
	updatedAt: string,
	receipts: readonly TeamTaskReceiptRef[] = [],
): TeamSnapshot {
	const ids = new Set(taskIds);
	if (ids.size !== taskIds.length) throw new Error("duplicate team execution failure task");
	for (const id of taskIds) {
		if (!snapshot.tasks.some((task) => task.id === id)) {
			throw new Error(`team execution failure targets unknown task: ${id}`);
		}
	}
	const tasks = snapshot.tasks.map((task) =>
		ids.has(task.id)
			? ({
					...task,
					execution: {
						status: "failed",
						updated_at: updatedAt,
						receipt_ids:
							receipts.length > 0
								? receipts.filter((receipt) => receipt.task_id === task.id).map((receipt) => receipt.id)
								: (task.execution?.receipt_ids ?? []),
						error,
					},
				} satisfies TeamTask)
			: task,
	);
	return { ...snapshot, tasks, updated_at: updatedAt };
}
