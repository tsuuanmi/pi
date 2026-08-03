import { applyHudStatusFlags, type HudSummary, normalizeHudSummary } from "@tsuuanmi/pi-tui";
import type { WorkflowSkill } from "#workflows/session/paths";
import { assertNonEmptySessionId, workflowActiveStatePath } from "#workflows/session/session-layout";
import { isEntryStale, readExistingStateForMutation, writeJsonAtomic } from "#workflows/state/state-writer";

const ACTIVE_STATE_VERSION = 2 as const;

export interface WorkflowActiveEntry {
	skill: WorkflowSkill;
	active: boolean;
	phase?: string;
	updated_at: string;
	/** Session id that owns this entry. */
	session_id: string;
	hud?: HudSummary;
	state_path?: string;
	/** Skill that handed off TO this entry (caller of the handoff). */
	handoff_from?: string;
	/** Skill this entry handed off TO (callee of the handoff). */
	handoff_to?: string;
	/** Timestamp of the handoff transition. */
	handoff_at?: string;
	/** True when the skill has a blocking pending user question. */
	has_pending_question?: boolean;
	/** True when the entry's updated_at is outside the freshness window. */
	stale?: boolean;
}

export interface WorkflowActiveState {
	version: typeof ACTIVE_STATE_VERSION;
	active: boolean;
	updated_at: string;
	active_workflows: WorkflowActiveEntry[];
}

/** Options for session-scoped active-state operations. */
export interface SessionScopedOptions {
	sessionId: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeText(value: unknown, limit: number): string | undefined {
	if (typeof value !== "string") return undefined;
	const clean = value
		.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
		.replace(/[\r\n\t]+/g, " ")
		.trim();
	if (!clean) return undefined;
	return clean.length > limit ? clean.slice(0, limit) : clean;
}

function normalizeEntry(value: unknown, sessionId: string): WorkflowActiveEntry {
	if (!isPlainObject(value)) throw new Error("invalid workflow active-state entry");
	const skill = value.skill;
	if (skill !== "deep-interview" && skill !== "ralplan" && skill !== "team" && skill !== "ultragoal") {
		throw new Error("invalid workflow active-state skill");
	}
	const entrySessionId = value.session_id;
	if (typeof entrySessionId !== "string" || entrySessionId.length === 0 || entrySessionId.trim() !== entrySessionId) {
		throw new Error("workflow active-state entry requires session_id");
	}
	if (entrySessionId !== sessionId) {
		throw new Error(`workflow active-state session mismatch: expected ${sessionId}, received ${entrySessionId}`);
	}
	const phase = sanitizeText(value.phase, 80);
	const hud = normalizeHudSummary(value.hud);
	const statePath = sanitizeText(value.state_path, 240);
	const handoffFrom = sanitizeText(value.handoff_from, 80);
	const handoffTo = sanitizeText(value.handoff_to, 80);
	const handoffAt = sanitizeText(value.handoff_at, 40);
	return {
		skill,
		active: value.active !== false,
		...(phase ? { phase } : {}),
		updated_at: sanitizeText(value.updated_at, 40) ?? new Date(0).toISOString(),
		session_id: entrySessionId,
		...(hud ? { hud } : {}),
		...(statePath ? { state_path: statePath } : {}),
		...(handoffFrom ? { handoff_from: handoffFrom } : {}),
		...(handoffTo ? { handoff_to: handoffTo } : {}),
		...(handoffAt ? { handoff_at: handoffAt } : {}),
		...(value.has_pending_question === true ? { has_pending_question: true } : {}),
		...(value.stale === true ? { stale: true } : {}),
	};
}

/** Entry key for dedup: `skill::session_id`. */
function entryKey(entry: WorkflowActiveEntry): string {
	return `${entry.skill}::${entry.session_id}`;
}

/** Skills in the planning pipeline (DI -> ralplan -> ultragoal). */
const PLANNING_PIPELINE_SKILLS = new Set<string>(["deep-interview", "ralplan", "ultragoal"]);

function pipelineEntryRecency(entry: WorkflowActiveEntry): number {
	const timestamp = entry.updated_at ? Date.parse(entry.updated_at) : Number.NaN;
	return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function collapsePlanningPipeline(entries: readonly WorkflowActiveEntry[]): WorkflowActiveEntry[] {
	const pipeline = entries.filter((entry) => PLANNING_PIPELINE_SKILLS.has(entry.skill));
	if (pipeline.length <= 1) return [...entries];
	let current = pipeline[0];
	let currentRecency = pipelineEntryRecency(current);
	for (const entry of pipeline) {
		const recency = pipelineEntryRecency(entry);
		const better = Number.isFinite(recency) && (!Number.isFinite(currentRecency) || recency > currentRecency);
		if (better) {
			current = entry;
			currentRecency = recency;
		}
	}
	return entries.filter((entry) => !PLANNING_PIPELINE_SKILLS.has(entry.skill) || entry === current);
}

function entryRecency(entry: WorkflowActiveEntry): number {
	const ms = entry.updated_at ? Date.parse(entry.updated_at) : Number.NaN;
	return ms;
}

/** Pick the surviving row for a skill by timestamp, then active status. */
function moreVisibleEntry(incumbent: WorkflowActiveEntry, challenger: WorkflowActiveEntry): WorkflowActiveEntry {
	const ri = entryRecency(incumbent);
	const rc = entryRecency(challenger);
	const vi = Number.isFinite(ri);
	const vc = Number.isFinite(rc);
	if (vi && vc && ri !== rc) return ri > rc ? incumbent : challenger;
	if (vi !== vc) return vi ? incumbent : challenger;
	if (incumbent.active !== challenger.active) return incumbent.active ? incumbent : challenger;
	return incumbent;
}

/** Collapse entries to a single row per skill. */
function dedupeVisibleBySkill(entries: WorkflowActiveEntry[]): WorkflowActiveEntry[] {
	const winners = new Map<string, WorkflowActiveEntry>();
	for (const entry of entries) {
		const current = winners.get(entry.skill);
		winners.set(entry.skill, current ? moreVisibleEntry(current, entry) : entry);
	}
	return [...winners.values()];
}

/** Read and validate entries for one session. */
async function readAllEntries(filePath: string, sessionId: string): Promise<WorkflowActiveEntry[] | undefined> {
	const read = await readExistingStateForMutation(filePath);
	if (read.kind === "absent") return undefined;
	if (read.kind === "corrupt") throw new Error("workflow active state is unreadable");
	if (read.value.version !== ACTIVE_STATE_VERSION) {
		throw new Error(`unsupported workflow active-state version: ${String(read.value.version)}`);
	}
	if (!Array.isArray(read.value.active_workflows)) {
		throw new Error("workflow active state requires active_workflows");
	}
	return read.value.active_workflows.map((entry) => normalizeEntry(entry, sessionId));
}

/**
 * Read the workflow active state for one session.
 *
 * Only active entries are returned. Returns undefined when the state file is absent.
 */
export async function readWorkflowActiveState(
	cwd: string,
	options: SessionScopedOptions,
): Promise<WorkflowActiveState | undefined> {
	assertNonEmptySessionId(options.sessionId, "readWorkflowActiveState");
	const sessionId = options.sessionId.trim();
	const entries = await readAllEntries(workflowActiveStatePath(cwd, sessionId), sessionId);
	if (entries === undefined) return undefined;
	return buildActiveState(dedupeVisibleBySkill(entries));
}

/**
 * Sync workflow active state for one session.
 *
 * Inactive entries remain persisted for the session's current handoff state;
 * the active filter is applied when the state is read.
 */
export async function syncWorkflowActiveState(
	cwd: string,
	entry: Omit<WorkflowActiveEntry, "updated_at" | "session_id"> & { updated_at?: string },
	options: SessionScopedOptions,
): Promise<WorkflowActiveState> {
	assertNonEmptySessionId(options.sessionId, "syncWorkflowActiveState");
	const sessionId = options.sessionId.trim();
	const now = entry.updated_at ?? new Date().toISOString();
	const nextEntry: WorkflowActiveEntry = {
		...entry,
		updated_at: now,
		session_id: sessionId,
		...(entry.hud ? { hud: normalizeHudSummary(entry.hud) } : {}),
		...(sanitizeText(entry.handoff_from, 80) ? { handoff_from: sanitizeText(entry.handoff_from, 80) } : {}),
		...(sanitizeText(entry.handoff_to, 80) ? { handoff_to: sanitizeText(entry.handoff_to, 80) } : {}),
		...(sanitizeText(entry.handoff_at, 40) ? { handoff_at: sanitizeText(entry.handoff_at, 40) } : {}),
		...(entry.has_pending_question === true ? { has_pending_question: true } : {}),
	};

	const filePath = workflowActiveStatePath(cwd, sessionId);
	const prior = (await readAllEntries(filePath, sessionId)) ?? [];
	const key = entryKey(nextEntry);
	const merged = new Map<string, WorkflowActiveEntry>();
	for (const item of prior) merged.set(entryKey(item), item);
	merged.set(key, nextEntry);

	const allEntries = [...merged.values()].sort((a, b) => a.skill.localeCompare(b.skill));
	const activeWorkflows = allEntries.filter((e) => e.active);
	await writeJsonAtomic(
		filePath,
		{
			version: ACTIVE_STATE_VERSION,
			active: activeWorkflows.length > 0,
			updated_at: now,
			active_workflows: allEntries,
		},
		{ cwd },
	);

	return {
		version: ACTIVE_STATE_VERSION,
		active: activeWorkflows.length > 0,
		updated_at: now,
		active_workflows: activeWorkflows.sort((a, b) => a.skill.localeCompare(b.skill)),
	};
}

/**
 * Build the active-state response from deduped entries, applying workflow
 * visibility rules before delegating generic HUD staleness decoration to TUI.
 */
function buildActiveState(entries: WorkflowActiveEntry[]): WorkflowActiveState {
	const nowMs = Date.now();
	const visibleEntries = entries
		.filter((entry) => entry.active)
		.map((entry) => {
			const pendingEntry = entry.has_pending_question
				? {
						...entry,
						hud: entry.hud
							? { ...entry.hud, severity: "blocked" as const }
							: ({ version: 1, severity: "blocked" as const } satisfies HudSummary),
					}
				: entry;
			return applyHudStatusFlags(pendingEntry, { stale: isEntryStale(entry.updated_at, nowMs) });
		});
	const activeWorkflows = collapsePlanningPipeline(visibleEntries).sort((a, b) => a.skill.localeCompare(b.skill));

	const updatedAt = entries[0]?.updated_at ?? new Date(0).toISOString();

	return {
		version: ACTIVE_STATE_VERSION,
		active: activeWorkflows.length > 0,
		updated_at: updatedAt,
		active_workflows: activeWorkflows,
	};
}

/** Entry passed to `applyHandoffToActiveState` for the caller (demoted) side. */
export interface HandoffSide {
	skill: WorkflowSkill;
	phase?: string;
	state_path?: string;
	hud?: HudSummary;
}

/** Options for `applyHandoffToActiveState`. sessionId is required. */
export interface ApplyHandoffOptions {
	cwd: string;
	/** Skill being demoted (handing off). */
	caller: HandoffSide;
	/** Skill being promoted (receiving the handoff). */
	callee: HandoffSide;
	/** Session id to tag both entries with. */
	sessionId: string;
	/** Shared timestamp; defaults to now. */
	nowIso?: string;
}

/**
 * Atomically apply a workflow-skill handoff in a single active-state write.
 *
 * The caller skill is demoted to `active: false` with `handoff_to` and
 * `handoff_at`; the callee skill is promoted to `active: true` with
 * `handoff_from` and `handoff_at`. Both entries are tagged with `session_id`
 * for the session. All other entries are preserved. The write is atomic (single
 * file mutation) so no partial state is observable during the transition.
 *
 * (Aligned with gajae-code's `applyHandoffToActiveState` but simplified for
 * Pi's single-file active-state model.)
 */
export async function applyHandoffToActiveState(options: ApplyHandoffOptions): Promise<WorkflowActiveState> {
	assertNonEmptySessionId(options.sessionId, "applyHandoffToActiveState");
	const now = options.nowIso ?? new Date().toISOString();
	const sessionId = options.sessionId.trim();
	const tag = { session_id: sessionId };

	const callerEntry: WorkflowActiveEntry = {
		...options.caller,
		active: false,
		updated_at: now,
		...tag,
		handoff_to: options.callee.skill,
		handoff_at: now,
		...(options.caller.hud ? { hud: normalizeHudSummary(options.caller.hud) } : {}),
	};
	const calleeEntry: WorkflowActiveEntry = {
		...options.callee,
		active: true,
		updated_at: now,
		...tag,
		handoff_from: options.caller.skill,
		handoff_at: now,
		...(options.callee.hud ? { hud: normalizeHudSummary(options.callee.hud) } : {}),
	};

	const filePath = workflowActiveStatePath(options.cwd, sessionId);
	const prior = (await readAllEntries(filePath, sessionId)) ?? [];
	const merged = new Map<string, WorkflowActiveEntry>();
	for (const item of prior) merged.set(entryKey(item), item);
	merged.set(entryKey(callerEntry), callerEntry);
	merged.set(entryKey(calleeEntry), calleeEntry);

	const allEntries = [...merged.values()].sort((a, b) => a.skill.localeCompare(b.skill));
	const activeWorkflows = allEntries.filter((e) => e.active);
	await writeJsonAtomic(
		filePath,
		{
			version: ACTIVE_STATE_VERSION,
			active: activeWorkflows.length > 0,
			updated_at: now,
			active_workflows: allEntries,
		},
		{ cwd: options.cwd },
	);

	return {
		version: ACTIVE_STATE_VERSION,
		active: activeWorkflows.length > 0,
		updated_at: now,
		active_workflows: activeWorkflows.sort((a, b) => a.skill.localeCompare(b.skill)),
	};
}
