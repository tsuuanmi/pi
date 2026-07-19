import { applyHudStatusFlags, type HudSummary, normalizeHudSummary } from "@tsuuanmi/pi-tui";
import type { WorkflowSkill } from "#workflows/session/paths";
import { workflowActiveStatePath } from "#workflows/session/session-layout";
import { isEntryStale, readExistingStateForMutation, writeJsonAtomic } from "#workflows/state/state-writer";

export interface WorkflowActiveEntry {
	skill: WorkflowSkill;
	active: boolean;
	phase?: string;
	updated_at: string;
	/** Session id that owns this entry. Empty/undefined = global fallback. */
	session_id?: string;
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
	version: 1;
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

function normalizeEntry(value: unknown): WorkflowActiveEntry | undefined {
	if (!isPlainObject(value)) return undefined;
	const skill = value.skill;
	if (skill !== "deep-interview" && skill !== "ralplan" && skill !== "team" && skill !== "ultragoal") return undefined;
	const updatedAt = sanitizeText(value.updated_at, 40) ?? new Date(0).toISOString();
	return {
		skill,
		active: value.active !== false,
		...(sanitizeText(value.phase, 80) ? { phase: sanitizeText(value.phase, 80) } : {}),
		updated_at: updatedAt,
		...(sanitizeText(value.session_id, 80) ? { session_id: sanitizeText(value.session_id, 80) } : {}),
		...(normalizeHudSummary(value.hud) ? { hud: normalizeHudSummary(value.hud) } : {}),
		...(sanitizeText(value.state_path, 240) ? { state_path: sanitizeText(value.state_path, 240) } : {}),
		...(sanitizeText(value.handoff_from, 80) ? { handoff_from: sanitizeText(value.handoff_from, 80) } : {}),
		...(sanitizeText(value.handoff_to, 80) ? { handoff_to: sanitizeText(value.handoff_to, 80) } : {}),
		...(sanitizeText(value.handoff_at, 40) ? { handoff_at: sanitizeText(value.handoff_at, 40) } : {}),
		...(value.has_pending_question === true ? { has_pending_question: true } : {}),
		...(value.stale === true ? { stale: true } : {}),
	};
}

/**
 * Entry key for dedup: `skill::session_id`. The same skill can have a
 * global entry (no session_id) and a session-specific entry, both visible
 * to a session-scoped read.
 */
function entryKey(entry: WorkflowActiveEntry): string {
	return `${entry.skill}::${entry.session_id ?? ""}`;
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

/**
 * Session ownership rank for a row visible to a `sessionId` read. A row owned
 * by the exact session outranks a foreign-session row.
 */
function sessionScopeRank(entry: WorkflowActiveEntry, sessionId?: string): number {
	const scope = sessionId?.trim() ?? "";
	if (!scope) return 0;
	const entrySession = entry.session_id?.trim() ?? "";
	if (entrySession === scope) return 2;
	if (!entrySession) return 1;
	return 0;
}

function entryRecency(entry: WorkflowActiveEntry): number {
	const ms = entry.updated_at ? Date.parse(entry.updated_at) : Number.NaN;
	return ms;
}

/**
 * Pick the surviving row for a single skill within a session-scoped visible set.
 * Precedence: session ownership rank, then newer timestamp, then active over
 * inactive. (Aligned with gajae-code's `moreVisibleEntry`.)
 */
function moreVisibleEntry(
	incumbent: WorkflowActiveEntry,
	challenger: WorkflowActiveEntry,
	sessionId?: string,
): WorkflowActiveEntry {
	const scopeDelta = sessionScopeRank(incumbent, sessionId) - sessionScopeRank(challenger, sessionId);
	if (scopeDelta !== 0) return scopeDelta > 0 ? incumbent : challenger;
	const ri = entryRecency(incumbent);
	const rc = entryRecency(challenger);
	const vi = Number.isFinite(ri);
	const vc = Number.isFinite(rc);
	if (vi && vc && ri !== rc) return ri > rc ? incumbent : challenger;
	if (vi !== vc) return vi ? incumbent : challenger;
	const incumbentActive = incumbent.active;
	const challengerActive = challenger.active;
	if (incumbentActive !== challengerActive) return incumbentActive ? incumbent : challenger;
	return incumbent;
}

/**
 * Collapse entries to a single row per skill, picking the most visible entry.
 * (Aligned with gajae-code's `dedupeVisibleBySkill`.)
 */
function dedupeVisibleBySkill(entries: WorkflowActiveEntry[], sessionId?: string): WorkflowActiveEntry[] {
	const winners = new Map<string, WorkflowActiveEntry>();
	for (const entry of entries) {
		const current = winners.get(entry.skill);
		winners.set(entry.skill, current ? moreVisibleEntry(current, entry, sessionId) : entry);
	}
	return [...winners.values()];
}

/**
 * Filter root entries visible to a session-scoped read. A row is visible if its
 * session_id matches the scope, or if it has no session_id (global fallback).
 * Foreign-session rows are hidden. With no scope session, all rows are visible.
 * (Aligned with gajae-code's `filterRootEntriesForSession`.)
 */
function filterEntriesForSession(entries: WorkflowActiveEntry[], sessionId?: string): WorkflowActiveEntry[] {
	const scope = sessionId?.trim() ?? "";
	if (!scope) return entries;
	return entries.filter((entry) => {
		const entrySession = entry.session_id?.trim() ?? "";
		return entrySession === scope || !entrySession;
	});
}

/**
 * Read all entries (active + inactive) from the root state file.
 * Returns undefined when the file is absent. Corrupt files are tolerated.
 */
async function readAllEntries(filePath: string): Promise<WorkflowActiveEntry[] | undefined> {
	const read = await readExistingStateForMutation(filePath);
	if (read.kind === "absent") return undefined;
	if (read.kind === "corrupt") return [];
	if (!Array.isArray(read.value.active_workflows)) return [];
	return read.value.active_workflows
		.map(normalizeEntry)
		.filter((entry): entry is WorkflowActiveEntry => entry !== undefined);
}

/**
 * Read the workflow active state for a project, optionally scoped to a session.
 *
 * Only active entries are returned. Returns undefined when the state file is absent.
 */
export async function readWorkflowActiveState(
	cwd: string,
	options: SessionScopedOptions,
): Promise<WorkflowActiveState | undefined> {
	const sessionId = options.sessionId;
	const sessionEntries = await readAllEntries(workflowActiveStatePath(cwd, sessionId));
	if (sessionEntries === undefined) return undefined;
	const visible = filterEntriesForSession(sessionEntries, sessionId);
	const deduped = dedupeVisibleBySkill(visible, sessionId);
	return buildActiveState(deduped);
}

/**
 * Sync workflow active state for a project, optionally scoped to a session.
 *
 * The entry is tagged with `session_id` (when provided) and upserted into the
 * root `active-state.json` by `skill::session_id` key. When `active` is false,
 * the entry is kept (not deleted) so a session-scoped deactivation can override
 * a stale global active row on merged reads. The active filter is applied at
 * read time by `readWorkflowActiveState`.
 */
export async function syncWorkflowActiveState(
	cwd: string,
	entry: Omit<WorkflowActiveEntry, "updated_at" | "session_id"> & { updated_at?: string; session_id?: string },
	options: SessionScopedOptions,
): Promise<WorkflowActiveState> {
	const sessionId = options.sessionId;
	const now = entry.updated_at ?? new Date().toISOString();
	const nextEntry: WorkflowActiveEntry = {
		...entry,
		updated_at: now,
		...(sessionId ? { session_id: sessionId } : {}),
		...(entry.hud ? { hud: normalizeHudSummary(entry.hud) } : {}),
		...(sanitizeText(entry.handoff_from, 80) ? { handoff_from: sanitizeText(entry.handoff_from, 80) } : {}),
		...(sanitizeText(entry.handoff_to, 80) ? { handoff_to: sanitizeText(entry.handoff_to, 80) } : {}),
		...(sanitizeText(entry.handoff_at, 40) ? { handoff_at: sanitizeText(entry.handoff_at, 40) } : {}),
		...(entry.has_pending_question === true ? { has_pending_question: true } : {}),
	};

	const filePath = workflowActiveStatePath(cwd, sessionId);
	const prior = (await readAllEntries(filePath)) ?? [];
	const key = entryKey(nextEntry);
	const merged = new Map<string, WorkflowActiveEntry>();
	for (const item of prior) merged.set(entryKey(item), item);
	merged.set(key, nextEntry);

	const allEntries = [...merged.values()].sort((a, b) => a.skill.localeCompare(b.skill));
	const activeWorkflows = allEntries.filter((e) => e.active);
	await writeJsonAtomic(
		filePath,
		{
			version: 1,
			active: activeWorkflows.length > 0,
			updated_at: now,
			active_workflows: allEntries,
		},
		{ cwd },
	);

	return {
		version: 1,
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
		version: 1,
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
 * when provided. All other entries are preserved. The write is atomic (single
 * file mutation) so no partial state is observable during the transition.
 *
 * (Aligned with gajae-code's `applyHandoffToActiveState` but simplified for
 * Pi's single-file active-state model.)
 */
export async function applyHandoffToActiveState(options: ApplyHandoffOptions): Promise<WorkflowActiveState> {
	const now = options.nowIso ?? new Date().toISOString();
	const sessionId = options.sessionId;
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
	const prior = (await readAllEntries(filePath)) ?? [];
	const merged = new Map<string, WorkflowActiveEntry>();
	for (const item of prior) merged.set(entryKey(item), item);
	merged.set(entryKey(callerEntry), callerEntry);
	merged.set(entryKey(calleeEntry), calleeEntry);

	const allEntries = [...merged.values()].sort((a, b) => a.skill.localeCompare(b.skill));
	const activeWorkflows = allEntries.filter((e) => e.active);
	await writeJsonAtomic(
		filePath,
		{
			version: 1,
			active: activeWorkflows.length > 0,
			updated_at: now,
			active_workflows: allEntries,
		},
		{ cwd: options.cwd },
	);

	return {
		version: 1,
		active: activeWorkflows.length > 0,
		updated_at: now,
		active_workflows: activeWorkflows.sort((a, b) => a.skill.localeCompare(b.skill)),
	};
}
