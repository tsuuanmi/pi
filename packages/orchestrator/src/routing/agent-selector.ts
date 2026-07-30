import type { Agent } from "@tsuuanmi/pi-agent";
import type { TaskSnapshot } from "#orchestrator/task/types";
import type { RunTeamOptions, SchedulingStrategy, SchedulingWeights } from "#orchestrator/types";

export interface AgentSelectorConfig {
	weights?: Partial<SchedulingWeights>;
}

export interface AgentScore {
	agent: string;
	score: number;
	reasons: readonly string[];
}

export interface AgentRejection {
	agent: string;
	reasons: readonly string[];
}

export interface AgentSelection {
	agent: Agent;
	score: number;
	reasons: readonly string[];
	candidates: readonly AgentScore[];
	rejected: readonly AgentRejection[];
}

export class AgentSelectionError extends Error {
	readonly taskId: string;
	readonly taskTitle: string;
	readonly rejected: readonly AgentRejection[];

	constructor(task: TaskSnapshot, rejected: readonly AgentRejection[]) {
		super(`No eligible agent for task "${task.title}" (${task.id}): ${formatRejections(rejected)}`);
		this.name = "AgentSelectionError";
		this.taskId = task.id;
		this.taskTitle = task.title;
		this.rejected = Object.freeze(
			rejected.map((item) => ({ agent: item.agent, reasons: Object.freeze([...item.reasons]) })),
		);
	}
}

export class AgentSelector {
	private readonly weights: Required<SchedulingWeights>;

	constructor(config: AgentSelectorConfig = {}) {
		this.weights = {
			fit: config.weights?.fit ?? 0.7,
			load: config.weights?.load ?? 0.3,
		};
	}

	select(
		task: TaskSnapshot,
		agents: readonly Agent[],
		allTasks: readonly TaskSnapshot[],
		load: ReadonlyMap<string, number>,
		index: number,
		_options: RunTeamOptions,
		strategy: SchedulingStrategy,
	): AgentSelection {
		if (agents.length === 0) throw new Error("Cannot select an agent from an empty team.");
		const rejected: AgentRejection[] = [];
		const eligible = agents.flatMap((agent) => {
			const reasons = rejectionReasons(task, agent);
			if (reasons.length > 0) {
				rejected.push({ agent: agent.name, reasons });
				return [];
			}
			return [agent];
		});

		if (eligible.length === 0) throw new AgentSelectionError(task, rejected);

		const scores = eligible
			.map((agent) => scoreAgent(task, agent, allTasks, load, strategy, this.weights))
			.sort((left, right) => right.score - left.score || left.agent.name.localeCompare(right.agent.name));
		const candidates = scores.map(({ agent, score, reasons }) => ({ agent: agent.name, score, reasons }));
		const selected = strategy === "round-robin" ? scores[index % scores.length] : scores[0];
		if (!selected) throw new Error(`No eligible agent for task "${task.title}" (${task.id}).`);
		return Object.freeze({
			agent: selected.agent,
			score: selected.score,
			reasons: selected.reasons,
			candidates: Object.freeze(candidates),
			rejected: Object.freeze(rejected),
		});
	}
}

function rejectionReasons(task: TaskSnapshot, agent: Agent): string[] {
	const reasons: string[] = [];
	const requirements = task.requires;
	const capabilities = new Set(agent.capabilities);
	const tools = new Set(agent.state.tools?.map((tool) => tool.name) ?? []);
	for (const capability of requirements.capabilities ?? []) {
		if (!capabilities.has(capability)) reasons.push(`missing capability "${capability}"`);
	}
	for (const tool of requirements.tools ?? []) {
		if (!tools.has(tool)) reasons.push(`missing tool "${tool}"`);
	}
	if (requirements.provider !== undefined && agent.state.model.provider !== requirements.provider) {
		reasons.push(`provider "${agent.state.model.provider}" does not match "${requirements.provider}"`);
	}
	if (requirements.api !== undefined && agent.state.model.api !== requirements.api) {
		reasons.push(`api "${agent.state.model.api}" does not match "${requirements.api}"`);
	}
	if (requirements.model !== undefined && agent.state.model.id !== requirements.model) {
		reasons.push(`model "${agent.state.model.id}" does not match "${requirements.model}"`);
	}
	return reasons;
}

function formatRejections(rejected: readonly AgentRejection[]): string {
	return rejected.map((item) => `${item.agent}: ${item.reasons.join(", ")}`).join("; ");
}

function scoreAgent(
	task: TaskSnapshot,
	agent: Agent,
	allTasks: readonly TaskSnapshot[],
	load: ReadonlyMap<string, number>,
	strategy: SchedulingStrategy,
	weights: Required<SchedulingWeights>,
): { agent: Agent; score: number; reasons: readonly string[] } {
	const capability = capabilityScore(task, agent);
	const loadScoreValue = loadScore(agent, load);
	const priority = priorityScore(task);
	const dependency = dependencyScore(task, allTasks);
	const score = strategyScore(strategy, capability, loadScoreValue, priority, dependency, weights);
	return {
		agent,
		score,
		reasons: Object.freeze([
			`capability=${capability.toFixed(3)}`,
			`load=${loadScoreValue.toFixed(3)}`,
			`priority=${priority.toFixed(3)}`,
			`dependency=${dependency.toFixed(3)}`,
		]),
	};
}

function strategyScore(
	strategy: SchedulingStrategy,
	capability: number,
	load: number,
	priority: number,
	dependency: number,
	weights: Required<SchedulingWeights>,
): number {
	switch (strategy) {
		case "capability-match":
			return capability;
		case "least-busy":
			return load;
		case "dependency-first":
			return dependency + priority * 0.01;
		case "round-robin":
			return 0;
		case "composite":
			return ((capability + priority + dependency) / 3) * weights.fit + load * weights.load;
	}
}

function capabilityScore(task: TaskSnapshot, agent: Agent): number {
	const required = task.requires.capabilities ?? [];
	if (required.length === 0) return 1;
	const capabilities = new Set(agent.capabilities);
	const matched = required.filter((capability) => capabilities.has(capability)).length;
	return matched / required.length;
}

function loadScore(agent: Agent, load: ReadonlyMap<string, number>): number {
	const count = load.get(agent.name) ?? 0;
	return 1 / (1 + count);
}

function priorityScore(task: TaskSnapshot): number {
	switch (task.priority) {
		case "critical":
			return 1;
		case "high":
			return 0.75;
		case "normal":
			return 0.5;
		case "low":
			return 0.25;
		default:
			return 0.5;
	}
}

function dependencyScore(task: TaskSnapshot, allTasks: readonly TaskSnapshot[]): number {
	const dependents = allTasks.filter((candidate) => candidate.dependsOn.includes(task.id)).length;
	return Math.min(1, dependents / Math.max(1, allTasks.length - 1));
}
