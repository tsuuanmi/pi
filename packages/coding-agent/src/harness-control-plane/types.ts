export type Harness = "pi";
export type SessionMode = "implement" | "review";

export type HarnessLifecycle =
	| "new"
	| "started"
	| "submitted"
	| "observing"
	| "recovering"
	| "validating"
	| "finalizing"
	| "completed"
	| "blocked"
	| "retired";

export type GitDelta = "clean" | "dirty" | "zero-delta" | "unknown";
export type RiskKind = "normal" | "prompt-not-accepted" | "deleted-worktree" | "vanished-dirty";

export type HarnessVerb =
	| "start"
	| "submit"
	| "observe"
	| "classify"
	| "recover"
	| "validate"
	| "finalize"
	| "retire"
	| "events"
	| "monitor"
	| "operate"
	| "vanish";

export interface NextAllowedAction {
	verb: HarnessVerb;
	available: boolean;
	reason?: string;
}

export interface SessionStateView {
	sessionId: string;
	lifecycle: HarnessLifecycle;
	harness: Harness;
	ownerLive: boolean;
	blockers: string[];
}

export type RuntimeSeverity = "info" | "warn" | "critical";

export interface PrimitiveResponse<E = Record<string, unknown>> {
	ok: boolean;
	state: SessionStateView;
	evidence: E;
	nextAllowedActions: NextAllowedAction[];
}

export interface SessionHandle {
	sessionId: string;
	harness: Harness;
	mode?: SessionMode;
	repo: string | null;
	workspace: string;
	branch: string | null;
	base: string | null;
	issueOrPr: string | null;
	processHandle: { kind: "runtime-owner"; ownerId: string | null; pid: number | null };
	rpcHandle: { kind: "rpc-subprocess"; pid: number | null; sessionDir: string };
	ownerHandle: { leasePath: string; endpoint: string | null; heartbeatAt: string | null };
	routerHandle: { kind: "default-in-owner"; policy: string; eventsPath: string };
	viewportHandle: { kind: "event-monitor"; tmuxSessionName: string | null; viewOnly: true };
	startedAt: string;
	updatedAt: string;
}

export interface SessionState {
	schemaVersion: number;
	sessionId: string;
	lifecycle: HarnessLifecycle;
	harness: Harness;
	handle: SessionHandle;
	retries: Record<string, number>;
	blockers: string[];
	createdAt: string;
	updatedAt: string;
}

export interface RuntimeWriter {
	ownerId: string;
	leaseEpoch: number;
}

export interface WorkflowRuntimeEvent<E = Record<string, unknown>> {
	schemaVersion: 1;
	eventId: string;
	cursor: number;
	createdAt: string;
	severity: RuntimeSeverity;
	kind: string;
	state: SessionStateView;
	evidence: E;
	nextAllowedActions: NextAllowedAction[];
	writer: RuntimeWriter;
}

export interface RuntimeReceipt<E = Record<string, unknown>> {
	schemaVersion: 1;
	receiptId: string;
	sessionId: string;
	verb: HarnessVerb;
	accepted: boolean;
	createdAt: string;
	writer: RuntimeWriter;
	stateBefore?: SessionStateView;
	stateAfter?: SessionStateView;
	eventCursorRange?: { from: number; to: number };
	evidence: E;
	contentSha256: string;
}

export interface RuntimeLogDiagnostic {
	path: string;
	line: number;
	code: "invalid-json" | "invalid-shape";
	message: string;
}

export interface RuntimeLogReadResult<T> {
	rows: T[];
	diagnostics: RuntimeLogDiagnostic[];
	maxCursor: number;
}

export interface Observation {
	lifecycle: HarnessLifecycle;
	ownerLive: boolean;
	cwd: string;
	branch: string | null;
	gitDelta: GitDelta;
	lastActivityAt: string | null;
	observedSignals: string[];
	risk: RiskKind;
	readyForSubmit?: boolean;
	submitUnavailableReason?: string | null;
}

export const SESSION_SCHEMA_VERSION = 1 as const;
