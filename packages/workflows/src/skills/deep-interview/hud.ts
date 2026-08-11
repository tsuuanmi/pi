import type { HudChip, HudSummary } from "@tsuuanmi/pi-tui";
import type { DeepInterviewStateEnvelope } from "#workflows/skills/deep-interview/types";

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
	payload: DeepInterviewStateEnvelope,
	options: { specStatus?: string; updatedAt: string },
): HudSummary {
	const state = payload.state;
	const rounds = state.rounds;
	if (
		state.current_ambiguity !== undefined &&
		(typeof state.current_ambiguity !== "number" || !Number.isFinite(state.current_ambiguity))
	) {
		throw new Error("deep-interview HUD current ambiguity must be finite");
	}
	const ambiguity = state.current_ambiguity as number | undefined;
	const threshold = payload.threshold;
	const target = state.topology?.status === "confirmed" ? state.topology.last_targeted_component_id : undefined;
	return {
		version: 1,
		chips: present([
			chip("phase", payload.current_phase, 10),
			chip("ambiguity", [percent(ambiguity), percent(threshold)].filter(Boolean).join("/"), 20),
			chip("round", String(rounds.length), 30),
			chip("target", target, 40),
			chip("spec", options.specStatus, 60),
		]),
		updated_at: options.updatedAt,
	};
}
