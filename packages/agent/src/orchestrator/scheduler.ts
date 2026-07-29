import type { Agent } from "#agent/agent/agent";
import type { RunTeamOptions, SchedulingStrategy, SchedulingWeights } from "#agent/orchestrator/types";
import type { Task } from "#agent/task/task";
import type { TaskPriority, TaskSnapshot } from "#agent/task/types";

const DEFAULT_SCHEDULING_WEIGHTS: SchedulingWeights = { fit: 0.7, load: 0.3 };

export interface SchedulerConfig {
	schedulingStrategy?: SchedulingStrategy;
	schedulingWeights?: Partial<SchedulingWeights>;
}

export class Scheduler {
	private readonly schedulingStrategy: SchedulingStrategy;
	private readonly weights: SchedulingWeights;
	private roundRobinCursor = 0;

	constructor(config: SchedulerConfig = {}) {
		this.schedulingStrategy = config.schedulingStrategy ?? "dependency-first";
		this.weights = resolveSchedulingWeights(config.schedulingWeights);
	}

	assignReadyTasks(
		tasks: Task[],
		allTasks: readonly TaskSnapshot[],
		agents: readonly Agent[],
		options: RunTeamOptions,
	): Task[] {
		const available = [...agents];
		if (available.length === 0) throw new Error("Cannot run a team without agents.");
		const strategy = options.schedulingStrategy ?? this.schedulingStrategy;
		const ordered = this.orderTasks(tasks, allTasks, strategy);
		const load = currentLoad(available, allTasks);
		return ordered.map((task, index) => {
			const snapshot = task.snapshot();
			if (!snapshot.assignee) {
				const agent = this.selectAgent(snapshot, available, allTasks, load, index, options, strategy);
				task.assign(agent.name);
				load.set(agent.name, (load.get(agent.name) ?? 0) + 1);
			}
			return task;
		});
	}

	private orderTasks(tasks: readonly Task[], allTasks: readonly TaskSnapshot[], strategy: SchedulingStrategy): Task[] {
		return [...tasks].sort((left, right) => {
			const priorityOrder = comparePriority(right.snapshot().priority, left.snapshot().priority);
			if (priorityOrder !== 0) return priorityOrder;
			if (strategy !== "dependency-first" && strategy !== "composite") {
				return left.id.localeCompare(right.id);
			}
			const dependencyOrder = this.countDependents(right.id, allTasks) - this.countDependents(left.id, allTasks);
			if (dependencyOrder !== 0) return dependencyOrder;
			return left.id.localeCompare(right.id);
		});
	}

	private selectAgent(
		task: TaskSnapshot,
		agents: readonly Agent[],
		allTasks: readonly TaskSnapshot[],
		load: ReadonlyMap<string, number>,
		index: number,
		options: RunTeamOptions,
		strategy: SchedulingStrategy,
	): Agent {
		if (task.assignee) {
			const assigned = agents.find((agent) => agent.name === task.assignee);
			if (!assigned) throw new Error(`Unknown assignee: ${task.assignee}`);
			return assigned;
		}
		if (strategy === "least-busy") return leastBusyAgent(task, agents, load);
		if (strategy === "capability-match") return this.selectCapabilityAgent(task, agents, index);
		if (strategy === "composite") return this.selectCompositeAgent(task, agents, allTasks, load, options);
		const agent = agents[this.roundRobinCursor % agents.length]!;
		this.roundRobinCursor = (this.roundRobinCursor + 1) % agents.length;
		return agent;
	}

	private selectCapabilityAgent(task: TaskSnapshot, agents: readonly Agent[], index: number): Agent {
		const eligible = eligibleAgents(task, agents);
		assertEligibleAgents(task, eligible);
		const scored = eligible.map((agent) => ({ agent, score: capabilityScore(task, agent) }));
		const best = scored.reduce((left, right) => (right.score > left.score ? right : left));
		if (best.score === 0) return eligible[index % eligible.length]!;
		return best.agent;
	}

	private selectCompositeAgent(
		task: TaskSnapshot,
		agents: readonly Agent[],
		allTasks: readonly TaskSnapshot[],
		load: ReadonlyMap<string, number>,
		options: RunTeamOptions,
	): Agent {
		const eligible = eligibleAgents(task, agents);
		assertEligibleAgents(task, eligible);
		const candidates = eligible;
		const maxLoad = Math.max(1, ...agents.map((agent) => load.get(agent.name) ?? 0));
		const weights = resolveSchedulingWeights(options.schedulingWeights ?? this.weights);
		const criticality = Math.max(1, this.countDependents(task.id, allTasks));
		return candidates
			.map((agent) => {
				const normalizedLoad = (load.get(agent.name) ?? 0) / maxLoad;
				return {
					agent,
					score: weights.fit * capabilityScore(task, agent) * criticality + weights.load * (1 - normalizedLoad),
				};
			})
			.sort((left, right) => {
				const scoreOrder = right.score - left.score;
				if (scoreOrder !== 0) return scoreOrder;
				return left.agent.name.localeCompare(right.agent.name);
			})[0]!.agent;
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
}

export function resolveSchedulingWeights(weights: Partial<SchedulingWeights> = {}): SchedulingWeights {
	const resolved = {
		fit: weights.fit ?? DEFAULT_SCHEDULING_WEIGHTS.fit,
		load: weights.load ?? DEFAULT_SCHEDULING_WEIGHTS.load,
	};
	if (
		!Number.isFinite(resolved.fit) ||
		!Number.isFinite(resolved.load) ||
		resolved.fit < 0 ||
		resolved.load < 0 ||
		(resolved.fit === 0 && resolved.load === 0)
	) {
		throw new RangeError("Scheduling weights must be finite, non-negative, and not both zero.");
	}
	return resolved;
}

function currentLoad(agents: readonly Agent[], allTasks: readonly TaskSnapshot[]): Map<string, number> {
	const load = new Map<string, number>(agents.map((agent) => [agent.name, 0]));
	for (const task of allTasks) {
		if (task.status === "in_progress" && task.assignee && load.has(task.assignee)) {
			load.set(task.assignee, (load.get(task.assignee) ?? 0) + 1);
		}
	}
	return load;
}

function leastBusyAgent(task: TaskSnapshot, agents: readonly Agent[], load: ReadonlyMap<string, number>): Agent {
	return [...agents].sort((left, right) => {
		const loadOrder = (load.get(left.name) ?? 0) - (load.get(right.name) ?? 0);
		if (loadOrder !== 0) return loadOrder;
		const leftRole = matchesRole(task, left) ? 1 : 0;
		const rightRole = matchesRole(task, right) ? 1 : 0;
		if (leftRole !== rightRole) return rightRole - leftRole;
		return left.name.localeCompare(right.name);
	})[0]!;
}

function assertEligibleAgents(task: TaskSnapshot, agents: readonly Agent[]): void {
	if (agents.length > 0) return;
	const required = task.requires.length > 0 ? task.requires.join(", ") : "none";
	throw new Error(`No eligible agent for task "${task.title}" (${task.id}); required capabilities: ${required}.`);
}

function eligibleAgents(task: TaskSnapshot, agents: readonly Agent[]): Agent[] {
	if (task.requires && task.requires.length > 0)
		return agents.filter((agent) => task.requires!.every((required) => agent.capabilities.includes(required)));
	return [...agents];
}

function capabilityScore(task: TaskSnapshot, agent: Agent): number {
	const haystack =
		`${task.title} ${task.description} ${task.requires?.join(" ") ?? ""} ${task.role ?? ""}`.toLowerCase();
	let score = 0;
	if (matchesRole(task, agent)) score += 3;
	for (const capability of agent.capabilities) {
		if (task.requires?.includes(capability)) score += 2;
		if (haystack.includes(capability.toLowerCase())) score += 1;
	}
	return score;
}

function matchesRole(task: TaskSnapshot, agent: Agent): boolean {
	if (!task.role) return false;
	return agent.name === task.role || agent.capabilities.includes(task.role);
}

function comparePriority(left?: TaskPriority, right?: TaskPriority): number {
	return priorityRank(left) - priorityRank(right);
}

function priorityRank(priority?: TaskPriority): number {
	switch (priority) {
		case "critical":
			return 4;
		case "high":
			return 3;
		case "normal":
			return 2;
		case "low":
			return 1;
		default:
			return 2;
	}
}
