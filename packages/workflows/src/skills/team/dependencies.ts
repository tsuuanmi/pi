import { validateTaskDependencies } from "@tsuuanmi/pi-orchestrator";
import type { TeamSelectorTask } from "#workflows/policy/expected-next-role";
import type { TeamTask } from "#workflows/skills/team/types";

interface TeamDependencyTask extends TeamSelectorTask {
	title?: string;
	depends_on?: readonly string[];
	blocked_by?: readonly string[];
}

export function assertTeamDependencies(tasks: readonly TeamDependencyTask[]): void {
	const validation = validateTaskDependencies(
		tasks.map((task) => ({
			id: task.id,
			title: task.title ?? task.id,
			dependsOn: task.depends_on ?? [],
		})),
	);
	if (!validation.valid) throw new Error(`Invalid team task dependency graph:\n${validation.errors.join("\n")}`);
}

export function isTeamTaskReady(task: TeamDependencyTask, tasks: readonly TeamDependencyTask[]): boolean {
	if (task.status !== "pending" || (task.blocked_by?.length ?? 0) > 0) return false;
	const statusById = new Map(tasks.map((candidate) => [candidate.id, candidate.status]));
	return (task.depends_on ?? []).every((id) => statusById.get(id) === "completed");
}

export function createRunnableTask(task: TeamTask, tasks: readonly TeamTask[]): TeamTask {
	assertTeamDependencies(tasks);
	if (!isTeamTaskReady(task, tasks)) throw new Error(`team task is not ready: ${task.id}`);
	return { ...task, depends_on: undefined };
}
