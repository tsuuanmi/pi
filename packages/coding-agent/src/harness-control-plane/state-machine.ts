import type {
	HarnessLifecycle,
	NextAllowedAction,
	PrimitiveResponse,
	SessionState,
	SessionStateView,
} from "./types.ts";

const TERMINAL_LIFECYCLES: ReadonlySet<HarnessLifecycle> = new Set(["completed", "retired"]);
const SUBMIT_READY_LIFECYCLES: ReadonlySet<HarnessLifecycle> = new Set(["started", "observing"]);

const TRANSITIONS: Record<HarnessLifecycle, readonly HarnessLifecycle[]> = {
	new: ["started", "blocked", "retired"],
	started: ["submitted", "observing", "recovering", "blocked", "retired"],
	submitted: ["observing", "recovering", "validating", "blocked", "retired"],
	observing: ["submitted", "recovering", "validating", "finalizing", "blocked", "retired"],
	recovering: ["started", "submitted", "observing", "blocked", "retired"],
	validating: ["finalizing", "observing", "blocked", "retired"],
	finalizing: ["completed", "blocked", "retired"],
	completed: ["retired"],
	blocked: ["started", "submitted", "observing", "recovering", "validating", "retired"],
	retired: [],
};

export function isTerminal(lifecycle: HarnessLifecycle): boolean {
	return TERMINAL_LIFECYCLES.has(lifecycle);
}

export function canTransition(from: HarnessLifecycle, to: HarnessLifecycle): boolean {
	return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: HarnessLifecycle, to: HarnessLifecycle): void {
	if (from === to) return;
	if (!canTransition(from, to)) throw new Error(`invalid_transition:${from}->${to}`);
}

export function submitUnavailableReason(
	lifecycle: HarnessLifecycle,
	ownerLive: boolean,
	gateReason: string | null = null,
): string | null {
	if (isTerminal(lifecycle)) return `lifecycle-terminal:${lifecycle}`;
	if (lifecycle === "blocked") return "lifecycle-blocked";
	if (!SUBMIT_READY_LIFECYCLES.has(lifecycle)) return `lifecycle-not-idle:${lifecycle}`;
	if (!ownerLive) return "owner-not-live";
	return gateReason;
}

export function nextAllowedActions(
	lifecycle: HarnessLifecycle,
	ownerLive: boolean,
	options: { submitUnavailableReason?: string | null } = {},
): NextAllowedAction[] {
	const terminal = isTerminal(lifecycle);
	const actions: NextAllowedAction[] = [];
	const add = (verb: NextAllowedAction["verb"], available: boolean, reason?: string): void => {
		actions.push(available ? { verb, available } : { verb, available, reason: reason ?? "unavailable" });
	};

	add("observe", true);
	add("classify", true);
	add("events", true);
	add("monitor", true);
	add("start", false, "session-already-exists");

	const submitReason = submitUnavailableReason(lifecycle, ownerLive, options.submitUnavailableReason ?? null);
	add("submit", submitReason === null, submitReason ?? undefined);

	add("recover", !terminal, terminal ? `lifecycle-terminal:${lifecycle}` : undefined);
	add("validate", !terminal, terminal ? `lifecycle-terminal:${lifecycle}` : undefined);
	add("finalize", !terminal, terminal ? `lifecycle-terminal:${lifecycle}` : undefined);
	add("retire", lifecycle !== "retired", lifecycle === "retired" ? "already-retired" : undefined);

	return actions;
}

export function buildStateView(state: SessionState, ownerLive: boolean): SessionStateView {
	return {
		sessionId: state.sessionId,
		lifecycle: state.lifecycle,
		harness: state.harness,
		ownerLive,
		blockers: state.blockers,
	};
}

export function buildResponse<E extends Record<string, unknown>>(
	state: SessionState,
	ownerLive: boolean,
	evidence: E,
	ok = true,
	submitGateReason?: string | null,
): PrimitiveResponse<E> {
	return {
		ok,
		state: buildStateView(state, ownerLive),
		evidence,
		nextAllowedActions: nextAllowedActions(state.lifecycle, ownerLive, { submitUnavailableReason: submitGateReason }),
	};
}
