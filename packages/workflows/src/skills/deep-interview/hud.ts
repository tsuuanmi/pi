import type { HudChip, HudSummary } from "@tsuuanmi/pi-tui";

function percent(value: number | undefined): string | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return `${Math.round(value * 100)}%`;
}

function chip(label: string, value: string | undefined, priority: number): HudChip | undefined {
	return value ? { label, value, priority } : undefined;
}

function present(chips: Array<HudChip | undefined>): HudChip[] {
	return chips.filter((item): item is HudChip => item !== undefined);
}

export function deriveDeepInterviewHud(
	payload: Record<string, unknown>,
	options: { phase?: string; specStatus?: string; updatedAt?: string } = {},
): HudSummary {
	if (!payload.state || typeof payload.state !== "object" || Array.isArray(payload.state)) {
		throw new Error("deep-interview HUD requires an object state");
	}
	const state = payload.state as Record<string, unknown>;
	if (!Array.isArray(state.rounds)) {
		throw new Error("deep-interview HUD requires state.rounds to be an array");
	}
	const rounds = state.rounds as Array<Record<string, unknown>>;
	if (
		state.current_ambiguity !== undefined &&
		(typeof state.current_ambiguity !== "number" || !Number.isFinite(state.current_ambiguity))
	) {
		throw new Error("deep-interview HUD current ambiguity must be finite");
	}
	if (typeof payload.threshold !== "number" || !Number.isFinite(payload.threshold)) {
		throw new Error("deep-interview HUD threshold must be finite");
	}
	const ambiguity = state.current_ambiguity as number | undefined;
	const threshold = payload.threshold;
	const topology =
		state.topology && typeof state.topology === "object" && !Array.isArray(state.topology)
			? (state.topology as Record<string, unknown>)
			: undefined;
	const target =
		topology && typeof topology.last_targeted_component_id === "string"
			? topology.last_targeted_component_id
			: undefined;
	return {
		version: 1,
		chips: present([
			chip(
				"phase",
				options.phase ?? (typeof payload.current_phase === "string" ? payload.current_phase : undefined),
				10,
			),
			chip("ambiguity", [percent(ambiguity), percent(threshold)].filter(Boolean).join("/"), 20),
			chip("round", String(rounds.length), 30),
			chip("target", target, 40),
			chip("spec", options.specStatus, 60),
		]),
		updated_at: options.updatedAt ?? new Date().toISOString(),
	};
}
