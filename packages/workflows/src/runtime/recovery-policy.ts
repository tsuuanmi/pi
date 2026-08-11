import type { GitDelta, SessionState } from "#workflows/runtime/types";
import type { WorkspaceMarker } from "#workflows/runtime/workspace-marker";

export type RecoveryDecisionKind =
	| "continue"
	| "reinject-prompt"
	| "restart-clean"
	| "restart-preserve-delta"
	| "finalize-blocked"
	| "human-check"
	| "blocked";

export interface RuntimeSnapshot {
	ownerLive: boolean;
	rpcLive: boolean | null;
	rpcIdle: boolean | null;
	lastFrameAt: string | null;
}

export interface ClassificationInput {
	state: SessionState;
	ownerLive: boolean;
	runtime: RuntimeSnapshot;
	workspace: WorkspaceMarker;
	recentSignals: string[];
	latestValidation: RecoveryValidationSummary | null;
	retryBudget: RetryBudget;
}

export interface RecoveryValidationSummary {
	valid: boolean;
	evidence: { overallPassed: boolean } | null;
}

export interface RetryBudget {
	reinjectPrompt: number;
	zeroDeltaVanish: number;
	dirtyVanishPreserve: number;
	validationRepair: number;
}

export interface RecoveryDecision {
	classification: RecoveryDecisionKind;
	reason: string;
	severity: "info" | "warn" | "critical";
	ownerRequired: boolean;
	blocked: boolean;
	blockers: string[];
}

const DEFAULT_RETRY_BUDGET: RetryBudget = {
	reinjectPrompt: 2,
	zeroDeltaVanish: 1,
	dirtyVanishPreserve: 1,
	validationRepair: 2,
};

export function parseRetryBudget(input: Record<string, unknown>, state: SessionState): RetryBudget {
	const override = input.retryBudget;
	const source =
		override && typeof override === "object" && !Array.isArray(override) ? (override as Record<string, unknown>) : {};
	return {
		reinjectPrompt:
			typeof source.reinjectPrompt === "number"
				? source.reinjectPrompt
				: DEFAULT_RETRY_BUDGET.reinjectPrompt - (state.retries.reinjectPrompt ?? 0),
		zeroDeltaVanish:
			typeof source.zeroDeltaVanish === "number"
				? source.zeroDeltaVanish
				: DEFAULT_RETRY_BUDGET.zeroDeltaVanish - (state.retries.zeroDeltaVanish ?? 0),
		dirtyVanishPreserve:
			typeof source.dirtyVanishPreserve === "number"
				? source.dirtyVanishPreserve
				: DEFAULT_RETRY_BUDGET.dirtyVanishPreserve - (state.retries.dirtyVanishPreserve ?? 0),
		validationRepair:
			typeof source.validationRepair === "number"
				? source.validationRepair
				: DEFAULT_RETRY_BUDGET.validationRepair - (state.retries.validationRepair ?? 0),
	};
}

export function classifyRecovery(input: ClassificationInput): RecoveryDecision {
	const lifecycle = input.state.lifecycle;
	if (lifecycle === "completed" || lifecycle === "retired") {
		return {
			classification: "blocked",
			reason: `lifecycle-terminal:${lifecycle}`,
			severity: "warn",
			ownerRequired: false,
			blocked: true,
			blockers: [`lifecycle-terminal:${lifecycle}`],
		};
	}
	// Deleted worktree / path mismatch is human-check in both branches (never recreate over unknown data).
	if (input.workspace.risk === "deleted") {
		return {
			classification: "human-check",
			reason: "deleted-worktree",
			severity: "critical",
			ownerRequired: false,
			blocked: true,
			blockers: ["deleted-worktree"],
		};
	}
	if (input.ownerLive) {
		// Owner is live: act on observed signals, not on gitDelta (a dirty tree is normal mid-work).
		if (
			input.recentSignals.includes("no-ack") ||
			input.recentSignals.includes("no-agent-start-within-timeout") ||
			input.recentSignals.includes("prompt-not-accepted")
		) {
			if (input.retryBudget.reinjectPrompt > 0) {
				return {
					classification: "reinject-prompt",
					reason: "prompt-not-accepted",
					severity: "warn",
					ownerRequired: true,
					blocked: false,
					blockers: [],
				};
			}
			return {
				classification: "blocked",
				reason: "reinject-prompt-budget-exhausted",
				severity: "critical",
				ownerRequired: false,
				blocked: true,
				blockers: ["reinject-prompt-budget-exhausted"],
			};
		}
		if (
			input.recentSignals.includes("validation-failed") ||
			(input.latestValidation && !input.latestValidation.evidence?.overallPassed)
		) {
			if (input.retryBudget.validationRepair > 0) {
				return {
					classification: "continue",
					reason: "validation-failed-repair-budget-remains",
					severity: "warn",
					ownerRequired: true,
					blocked: false,
					blockers: [],
				};
			}
			return {
				classification: "blocked",
				reason: "validation-repair-budget-exhausted",
				severity: "critical",
				ownerRequired: false,
				blocked: true,
				blockers: ["validation-repair-budget-exhausted"],
			};
		}
		if (input.runtime.rpcIdle === false) {
			return {
				classification: "continue",
				reason: "runtime-busy",
				severity: "info",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			};
		}
		return {
			classification: "continue",
			reason: "healthy",
			severity: "info",
			ownerRequired: true,
			blocked: false,
			blockers: [],
		};
	}
	// Owner / RPC vanished: branch on git delta. Every destructive branch requires a vanish receipt.
	if (input.workspace.risk === "not-git" || input.workspace.gitDelta === "unknown") {
		return {
			classification: "human-check",
			reason: "owner-vanished-unknown-delta",
			severity: "critical",
			ownerRequired: false,
			blocked: true,
			blockers: ["owner-vanished-unknown-delta"],
		};
	}
	switch (input.workspace.gitDelta) {
		case "clean":
			return {
				classification: "restart-clean",
				reason: "owner-vanished-clean",
				severity: "warn",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			};
		case "zero-delta":
			if (input.retryBudget.zeroDeltaVanish > 0) {
				return {
					classification: "restart-clean",
					reason: "owner-vanished-zero-delta",
					severity: "warn",
					ownerRequired: true,
					blocked: false,
					blockers: [],
				};
			}
			return {
				classification: "blocked",
				reason: "zero-delta-vanish-budget-exhausted",
				severity: "critical",
				ownerRequired: false,
				blocked: true,
				blockers: ["zero-delta-vanish-budget-exhausted"],
			};
		case "dirty":
			if (input.retryBudget.dirtyVanishPreserve > 0) {
				return {
					classification: "restart-preserve-delta",
					reason: "owner-vanished-dirty-delta",
					severity: "critical",
					ownerRequired: true,
					blocked: false,
					blockers: [],
				};
			}
			return {
				classification: "blocked",
				reason: "dirty-vanish-preserve-budget-exhausted",
				severity: "critical",
				ownerRequired: false,
				blocked: true,
				blockers: ["dirty-vanish-preserve-budget-exhausted"],
			};
		default:
			return {
				classification: "human-check",
				reason: "owner-vanished-unknown-delta",
				severity: "critical",
				ownerRequired: false,
				blocked: true,
				blockers: ["owner-vanished-unknown-delta"],
			};
	}
}

function budgetKeyFor(decision: RecoveryDecision, gitDelta: GitDelta): keyof RetryBudget | null {
	switch (decision.classification) {
		case "reinject-prompt":
			return "reinjectPrompt";
		case "restart-clean":
			// `clean` consumes nothing; `zero-delta` consumes one vanish budget.
			return gitDelta === "zero-delta" ? "zeroDeltaVanish" : null;
		case "restart-preserve-delta":
			return "dirtyVanishPreserve";
		case "continue":
			// `continue` consumes validationRepair only when repairing a validation failure.
			return decision.reason === "validation-failed-repair-budget-remains" ? "validationRepair" : null;
		default:
			return null;
	}
}

export function consumeBudget(state: SessionState, decision: RecoveryDecision, gitDelta: GitDelta): SessionState {
	const key = budgetKeyFor(decision, gitDelta);
	if (!key) return state;
	return { ...state, retries: { ...state.retries, [key]: (state.retries[key] ?? 0) + 1 } };
}
