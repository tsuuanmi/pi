// Architecture adapted from open-multi-agent (MIT).
import type { Agent } from "#agent/agent/agent";
import { extractTaskBridgeResult, formatTaskPrompt, type Task, TaskQueue } from "#agent/task";
import type { Team } from "#agent/team";
import type {
	OrchestratorConfig,
	RunTeamOptions,
	RunTeamResult,
	SchedulerWarning,
	SchedulingStrategy,
	SchedulingWeights,
	TaskInput,
	TaskSnapshot,
} from "#agent/types";

const DEFAULT_SCHEDULING_WEIGHTS: SchedulingWeights = { fit: 0.7, load: 0.3 };

export class Orchestrator {
	private readonly strategy: SchedulingStrategy;
	private readonly maxConcurrency: number;
	private readonly weights: SchedulingWeights;
	private readonly onWarning?: (warning: SchedulerWarning) => void;
	private roundRobinCursor = 0;

	constructor(config: OrchestratorConfig = {}) {
		this.strategy = config.strategy ?? "dependency-first";
		this.maxConcurrency = config.maxConcurrency ?? 4;
		this.weights = resolveWeights(config.schedulingWeights);
		this.onWarning = config.onWarning;
	}

	async run(team: Team, tasks: readonly (Task | TaskInput)[], options: RunTeamOptions = {}): Promise<RunTeamResult> {
		const queue = new TaskQueue();
		for (const task of tasks) queue.add(task);
		const maxConcurrency = Math.max(1, options.maxConcurrency ?? this.maxConcurrency);
		const inFlight = new Map<string, Promise<void>>();

		while (true) {
			queue.blockImpossible();
			let launched = false;
			while (inFlight.size < maxConcurrency) {
				const ready = this.assignReady(queue.ready(), queue.snapshots(), team.getAgents(), options);
				const next = ready.find((task) => !inFlight.has(task.id));
				if (!next) break;
				const promise = this.executeTask(next, queue, team, options).finally(() => {
					inFlight.delete(next.id);
				});
				inFlight.set(next.id, promise);
				launched = true;
			}
			if (inFlight.size === 0) break;
			if (!launched && inFlight.size >= maxConcurrency) await Promise.race(inFlight.values());
			else if (!launched) await Promise.race(inFlight.values());
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

	private assignReady(
		tasks: Task[],
		allTasks: readonly TaskSnapshot[],
		agents: readonly Agent[],
		options: RunTeamOptions,
	): Task[] {
		const available = [...agents];
		if (available.length === 0) throw new Error("Cannot run a team without agents.");
		const ordered = this.orderTasks(tasks, allTasks);
		const load = currentLoad(available, allTasks);
		return ordered.map((task, index) => {
			const snapshot = task.snapshot();
			if (!snapshot.assignee) {
				const agent = this.selectAgent(snapshot, available, allTasks, load, index, options);
				task.assign(agent.name);
				load.set(agent.name, (load.get(agent.name) ?? 0) + 1);
			}
			return task;
		});
	}

	private orderTasks(tasks: readonly Task[], allTasks: readonly TaskSnapshot[]): Task[] {
		if (this.strategy !== "dependency-first" && this.strategy !== "composite") return [...tasks];
		return [...tasks].sort(
			(left, right) => this.countDependents(right.id, allTasks) - this.countDependents(left.id, allTasks),
		);
	}

	private selectAgent(
		task: TaskSnapshot,
		agents: readonly Agent[],
		allTasks: readonly TaskSnapshot[],
		load: ReadonlyMap<string, number>,
		index: number,
		options: RunTeamOptions,
	): Agent {
		if (task.assignee) {
			const assigned = agents.find((agent) => agent.name === task.assignee);
			if (!assigned) throw new Error(`Unknown assignee: ${task.assignee}`);
			return assigned;
		}
		if (this.strategy === "least-busy") return leastBusyAgent(agents, load);
		if (this.strategy === "capability-match") return this.selectCapabilityAgent(task, agents, index, options);
		if (this.strategy === "composite") return this.selectCompositeAgent(task, agents, allTasks, load, options);
		const agent = agents[this.roundRobinCursor % agents.length]!;
		this.roundRobinCursor = (this.roundRobinCursor + 1) % agents.length;
		return agent;
	}

	private selectCapabilityAgent(
		task: TaskSnapshot,
		agents: readonly Agent[],
		index: number,
		options: RunTeamOptions,
	): Agent {
		const eligible = eligibleAgents(task, agents);
		if (eligible.length === 0) {
			this.warnNoEligible(task, options);
			return agents[index % agents.length]!;
		}
		const scored = eligible.map((agent) => ({ agent, score: capabilityScore(task, agent) }));
		const best = scored.reduce((left, right) => (right.score > left.score ? right : left));
		if (best.score === 0) return agents[index % agents.length]!;
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
		const candidates = eligible.length > 0 ? eligible : agents;
		if (eligible.length === 0) this.warnNoEligible(task, options);
		const maxLoad = Math.max(1, ...agents.map((agent) => load.get(agent.name) ?? 0));
		const weights = resolveWeights(options.schedulingWeights ?? this.weights);
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

	private warnNoEligible(task: TaskSnapshot, options: RunTeamOptions): void {
		const warning: SchedulerWarning = {
			code: "NO_ELIGIBLE_AGENT",
			message: `No agent satisfies requirements for task "${task.title}"; falling back to deterministic assignment.`,
			taskId: task.id,
			taskTitle: task.title,
			reasons:
				task.requires.length > 0
					? [`Missing required capabilities: ${task.requires.join(", ")}`]
					: ["No positive capability match."],
			fallback: "zero-fit-current-load",
		};
		options.onWarning?.(warning);
		if (this.onWarning !== options.onWarning) this.onWarning?.(warning);
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
		const prompt = formatTaskPrompt({ task: snapshot, completedDependencies });
		const result = await agent.run(prompt, { signal: options.signal, metadata: { taskId: snapshot.id } });
		if (result.success) {
			const bridgeResult = extractTaskBridgeResult(result);
			task.complete(bridgeResult.output, bridgeResult.structured);
			options.onTaskComplete?.(task.snapshot());
		} else {
			task.fail(result.error instanceof Error ? result.error.message : result.output || String(result.error));
			options.onTaskFail?.(task.snapshot());
		}
	}
}

function resolveWeights(weights: Partial<SchedulingWeights> = {}): SchedulingWeights {
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

function leastBusyAgent(agents: readonly Agent[], load: ReadonlyMap<string, number>): Agent {
	return [...agents].sort((left, right) => (load.get(left.name) ?? 0) - (load.get(right.name) ?? 0))[0]!;
}

function eligibleAgents(task: TaskSnapshot, agents: readonly Agent[]): Agent[] {
	if (task.requires.length === 0) return [...agents];
	return agents.filter((agent) => task.requires.every((required) => agent.capabilities.includes(required)));
}

function capabilityScore(task: TaskSnapshot, agent: Agent): number {
	const haystack = `${task.title} ${task.description} ${task.requires.join(" ")}`.toLowerCase();
	let score = 0;
	for (const capability of agent.capabilities) {
		if (task.requires.includes(capability)) score += 2;
		if (haystack.includes(capability.toLowerCase())) score += 1;
	}
	return score;
}

export async function runTeam(
	team: Team,
	tasks: readonly (Task | TaskInput)[],
	options: RunTeamOptions = {},
): Promise<RunTeamResult> {
	return new Orchestrator(options).run(team, tasks, options);
}
