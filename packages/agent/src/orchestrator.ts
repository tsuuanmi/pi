// Architecture adapted from open-multi-agent (MIT).
import type { Agent } from "#agent/agent";
import { type Task, TaskQueue } from "#agent/task";
import type { Team } from "#agent/team";
import type { RunTeamOptions, RunTeamResult, SchedulingStrategy, TaskInput, TaskSnapshot } from "#agent/types";

export interface OrchestratorConfig {
	strategy?: SchedulingStrategy;
	maxConcurrency?: number;
}

export class Orchestrator {
	private readonly strategy: SchedulingStrategy;
	private readonly maxConcurrency: number;

	constructor(config: OrchestratorConfig = {}) {
		this.strategy = config.strategy ?? "dependency-first";
		this.maxConcurrency = config.maxConcurrency ?? 4;
	}

	async run(team: Team, tasks: readonly (Task | TaskInput)[], options: RunTeamOptions = {}): Promise<RunTeamResult> {
		const queue = new TaskQueue();
		for (const task of tasks) queue.add(task);
		const maxConcurrency = Math.max(1, options.maxConcurrency ?? this.maxConcurrency);
		while (true) {
			queue.blockImpossible();
			const ready = this.assignReady(queue.ready(), queue.snapshots(), team.getAgents());
			if (ready.length === 0) break;
			for (let index = 0; index < ready.length; index += maxConcurrency) {
				const batch = ready.slice(index, index + maxConcurrency);
				await Promise.all(batch.map((task) => this.executeTask(task, queue, team, options)));
			}
		}
		for (const task of queue.list()) {
			if (task.status === "pending")
				task.block("Task is not reachable because its dependencies form a cycle or cannot be scheduled.");
		}
		const snapshots = queue.snapshots();
		const failed = snapshots.filter((task) => task.status === "failed" || task.status === "blocked");
		return {
			success: failed.length === 0,
			tasks: snapshots,
			output: snapshots
				.filter((task) => task.status === "completed")
				.map((task) => task.result ?? "")
				.join("\n\n"),
		};
	}

	private assignReady(tasks: Task[], allTasks: readonly TaskSnapshot[], agents: readonly Agent[]): Task[] {
		const available = [...agents];
		if (available.length === 0) throw new Error("Cannot run a team without agents.");
		const ordered = this.orderTasks(tasks, allTasks);
		return ordered.map((task, index) => {
			const snapshot = task.snapshot();
			if (!snapshot.assignee) task.assign(this.selectAgent(snapshot, available, index).name);
			return task;
		});
	}

	private orderTasks(tasks: readonly Task[], allTasks: readonly TaskSnapshot[]): Task[] {
		if (this.strategy !== "dependency-first") return [...tasks];
		return [...tasks].sort(
			(left, right) => this.countDependents(right.id, allTasks) - this.countDependents(left.id, allTasks),
		);
	}

	private selectAgent(task: TaskSnapshot, agents: readonly Agent[], index: number): Agent {
		if (task.assignee) {
			const assigned = agents.find((agent) => agent.name === task.assignee);
			if (!assigned) throw new Error(`Unknown assignee: ${task.assignee}`);
			return assigned;
		}
		if (this.strategy === "capability-match" && task.requires.length > 0) {
			const matched = agents.find((agent) =>
				task.requires.every((required) => agent.capabilities.includes(required)),
			);
			if (matched) return matched;
		}
		return agents[index % agents.length]!;
	}

	private countDependents(taskId: string, allTasks: readonly TaskSnapshot[]): number {
		const seen = new Set<string>();
		const queue = [taskId];
		while (queue.length > 0) {
			const current = queue.shift()!;
			for (const task of allTasks) {
				if (task.dependsOn.includes(current) && !seen.has(task.id)) {
					seen.add(task.id);
					queue.push(task.id);
				}
			}
		}
		return seen.size;
	}

	private async executeTask(task: Task, queue: TaskQueue, team: Team, options: RunTeamOptions): Promise<void> {
		task.start();
		options.onTaskStart?.(task.snapshot());
		const snapshot = task.snapshot();
		const agent = team.getAgent(snapshot.assignee ?? "");
		if (!agent) {
			task.fail(`Unknown assignee: ${snapshot.assignee ?? "unassigned"}`);
			options.onTaskFail?.(task.snapshot());
			return;
		}
		const completedDependencies = snapshot.dependsOn
			.map((id) => queue.get(id)?.snapshot())
			.filter((dependency): dependency is TaskSnapshot => dependency?.status === "completed");
		const result = await agent.executeTask(
			{ task: snapshot, agent, team, completedDependencies },
			{ signal: options.signal },
		);
		if (result.success) {
			task.complete(result.output);
			options.onTaskComplete?.(task.snapshot());
		} else {
			task.fail(result.output);
			options.onTaskFail?.(task.snapshot());
		}
	}
}

export async function runTeam(
	team: Team,
	tasks: readonly (Task | TaskInput)[],
	options: RunTeamOptions = {},
): Promise<RunTeamResult> {
	return new Orchestrator(options).run(team, tasks, options);
}
