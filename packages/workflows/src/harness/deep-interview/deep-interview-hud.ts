import type { WorkflowHudChip, WorkflowHudSummary } from "../shared/active-state.ts";
import { DEFAULT_DEEP_INTERVIEW_THRESHOLD } from "./deep-interview-state.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function percent(value: number | undefined): string | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return `${Math.round(value * 100)}%`;
}

function chip(label: string, value: string | undefined, priority: number): WorkflowHudChip | undefined {
	return value ? { label, value, priority } : undefined;
}

function compact(chips: Array<WorkflowHudChip | undefined>): WorkflowHudChip[] {
	return chips.filter((item): item is WorkflowHudChip => item !== undefined);
}

function latestScoredAmbiguity(rounds: unknown): number | undefined {
	if (!Array.isArray(rounds)) return undefined;
	for (let index = rounds.length - 1; index >= 0; index--) {
		const round = rounds[index];
		if (isPlainObject(round) && round.lifecycle === "scored" && typeof round.ambiguity === "number") {
			return round.ambiguity;
		}
	}
	return undefined;
}

function weakestDimensionFromTopology(
	topology: Record<string, unknown>,
	targetComponent: string | undefined,
): string | undefined {
	if (!Array.isArray(topology.components)) return undefined;
	const components = topology.components.filter(isPlainObject);
	const dimensionOf = (component: Record<string, unknown>): string | undefined =>
		typeof component.weakest_dimension === "string" && component.weakest_dimension.trim()
			? component.weakest_dimension
			: undefined;
	if (targetComponent) {
		const targeted = components.find((component) => component.id === targetComponent && dimensionOf(component));
		if (targeted) return dimensionOf(targeted);
	}
	const active = components.find((component) => component.status !== "deferred" && dimensionOf(component));
	if (active) return dimensionOf(active);
	const any = components.find((component) => dimensionOf(component));
	return any ? dimensionOf(any) : undefined;
}

export function deriveDeepInterviewHud(
	payload: Record<string, unknown>,
	options: { phase?: string; specStatus?: string; updatedAt?: string } = {},
): WorkflowHudSummary {
	const state = isPlainObject(payload.state) ? payload.state : {};
	const pickNumber = (key: string): number | undefined => {
		const value = state[key] ?? payload[key];
		return typeof value === "number" && Number.isFinite(value) ? value : undefined;
	};
	const phase = options.phase ?? (typeof payload.current_phase === "string" ? payload.current_phase : undefined);
	const rounds = Array.isArray(state.rounds)
		? state.rounds
		: Array.isArray(payload.rounds)
			? payload.rounds
			: undefined;
	const ambiguity = pickNumber("current_ambiguity") ?? latestScoredAmbiguity(rounds);
	const threshold = pickNumber("threshold") ?? DEFAULT_DEEP_INTERVIEW_THRESHOLD;
	const rawTopology = isPlainObject(state.topology)
		? state.topology
		: isPlainObject(payload.topology)
			? payload.topology
			: undefined;
	const topology = rawTopology && rawTopology.status !== "legacy_missing" ? rawTopology : undefined;
	const targetComponent =
		topology && typeof topology.last_targeted_component_id === "string"
			? topology.last_targeted_component_id
			: undefined;
	const weakestDimension = topology ? weakestDimensionFromTopology(topology, targetComponent) : undefined;
	const specStatus = options.specStatus ?? (typeof payload.spec_status === "string" ? payload.spec_status : undefined);
	return {
		version: 1,
		chips: compact([
			chip("phase", phase, 10),
			chip("ambiguity", [percent(ambiguity), percent(threshold)].filter(Boolean).join("/"), 20),
			chip("round", rounds ? String(rounds.length) : undefined, 30),
			chip("target", targetComponent, 40),
			chip("weakest", weakestDimension, 50),
			chip("spec", specStatus, 60),
		]),
		updated_at: options.updatedAt ?? new Date().toISOString(),
	};
}
