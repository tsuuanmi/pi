import type { WorkflowSkill } from "./paths.ts";
import { workflowActiveStatePath } from "./session-layout.ts";
import { isEntryStale, readExistingStateForMutation, writeJsonAtomic } from "./state-writer.ts";

export type WorkflowHudSeverity = "info" | "warning" | "blocked" | "error" | "success";

export interface WorkflowHudChip {
	label: string;
	value?: string;
	priority?: number;
	severity?: WorkflowHudSeverity;
}

export interface WorkflowHudSummary {
	version: 1;
	summary?: string;
	chips?: WorkflowHudChip[];
	details?: WorkflowHudChip[];
	severity?: WorkflowHudSeverity;
	updated_at?: string;
}

export interface WorkflowActiveEntry {
	skill: WorkflowSkill;
	active: boolean;
	phase?: string;
	updated_at: string;
	/** Session id that owns this entry. Empty/undefined = global fallback. */
	session_id?: string;
	hud?: WorkflowHudSummary;
	state_path?: string;
	/** Skill that handed off TO this entry (caller of the handoff). */
	handoff_from?: string;
	/** Skill this entry handed off TO (callee of the handoff). */
	handoff_to?: string;
	/** Timestamp of the handoff transition. */
	handoff_at?: string;
	/** True when the entry's updated_at is outside the freshness window. */
	stale?: boolean;
}

export interface WorkflowActiveState {
	version: 1;
	active: boolean;
	updated_at: string;
	active_workflows: WorkflowActiveEntry[];
}

/** Options for session-scoped active-state operations. Omitted sessionId uses legacy global state. */
export interface SessionScopedOptions {
	sessionId?: string;
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

function normalizeSeverity(value: unknown): WorkflowHudSeverity | undefined {
	return value === "info" || value === "warning" || value === "blocked" || value === "error" || value === "success"
		? value
		: undefined;
}

function normalizeHudChip(value: unknown): WorkflowHudChip | undefined {
	if (!isPlainObject(value)) return undefined;
	const label = sanitizeText(value.label, 32);
	if (!label) return undefined;
	const priority = typeof value.priority === "number" && Number.isFinite(value.priority) ? value.priority : undefined;
	return {
		label,
		...(sanitizeText(value.value, 80) ? { value: sanitizeText(value.value, 80) } : {}),
		...(priority !== undefined ? { priority } : {}),
		...(normalizeSeverity(value.severity) ? { severity: normalizeSeverity(value.severity) } : {}),
	};
}

function normalizeWorkflowHudSummary(value: unknown): WorkflowHudSummary | undefined {
	if (!isPlainObject(value) || value.version !== 1) return undefined;
	const chips = Array.isArray(value.chips)
		? value.chips
				.map(normalizeHudChip)
				.filter((chip): chip is WorkflowHudChip => chip !== undefined)
				.slice(0, 6)
		: undefined;
	const details = Array.isArray(value.details)
		? value.details
				.map(normalizeHudChip)
				.filter((chip): chip is WorkflowHudChip => chip !== undefined)
				.slice(0, 12)
		: undefined;
	return {
		version: 1,
		...(sanitizeText(value.summary, 120) ? { summary: sanitizeText(value.summary, 120) } : {}),
		...(chips && chips.length > 0 ? { chips } : {}),
		...(details && details.length > 0 ? { details } : {}),
		...(normalizeSeverity(value.severity) ? { severity: normalizeSeverity(value.severity) } : {}),
		...(sanitizeText(value.updated_at, 40) ? { updated_at: sanitizeText(value.updated_at, 40) } : {}),
	};
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
		...(normalizeWorkflowHudSummary(value.hud) ? { hud: normalizeWorkflowHudSummary(value.hud) } : {}),
		...(sanitizeText(value.state_path, 240) ? { state_path: sanitizeText(value.state_path, 240) } : {}),
		...(sanitizeText(value.handoff_from, 80) ? { handoff_from: sanitizeText(value.handoff_from, 80) } : {}),
		...(sanitizeText(value.handoff_to, 80) ? { handoff_to: sanitizeText(value.handoff_to, 80) } : {}),
		...(sanitizeText(value.handoff_at, 40) ? { handoff_at: sanitizeText(value.handoff_at, 40) } : {}),
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
 * When `sessionId` is omitted, the legacy global active-state file is read.
 * Only active entries are returned. Returns undefined when the state file is absent.
 */
export async function readWorkflowActiveState(
	cwd: string,
	options: SessionScopedOptions = {},
): Promise<WorkflowActiveState | undefined> {
	const sessionId = options.sessionId?.trim() || undefined;
	let sessionEntries = await readAllEntries(workflowActiveStatePath(cwd, sessionId));
	if (sessionEntries === undefined && sessionId) {
		sessionEntries = await readAllEntries(workflowActiveStatePath(cwd));
	}
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
	options: SessionScopedOptions = {},
): Promise<WorkflowActiveState> {
	const sessionId = options.sessionId?.trim() || undefined;
	const now = entry.updated_at ?? new Date().toISOString();
	const nextEntry: WorkflowActiveEntry = {
		...entry,
		updated_at: now,
		...(sessionId ? { session_id: sessionId } : {}),
		...(entry.hud ? { hud: normalizeWorkflowHudSummary(entry.hud) } : {}),
		...(sanitizeText(entry.handoff_from, 80) ? { handoff_from: sanitizeText(entry.handoff_from, 80) } : {}),
		...(sanitizeText(entry.handoff_to, 80) ? { handoff_to: sanitizeText(entry.handoff_to, 80) } : {}),
		...(sanitizeText(entry.handoff_at, 40) ? { handoff_at: sanitizeText(entry.handoff_at, 40) } : {}),
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

/** Skills in the planning pipeline (DI → ralplan → ultragoal). */
const PLANNING_PIPELINE_SKILLS = new Set<string>(["deep-interview", "ralplan", "ultragoal"]);

/**
 * Build the active-state response from deduped entries, applying staleness
 * checks and HUD severity escalation.
 */
function buildActiveState(entries: WorkflowActiveEntry[]): WorkflowActiveState {
	const nowMs = Date.now();
	const activeWorkflows = entries
		.filter((entry) => entry.active)
		.map((entry) => {
			const stale = isEntryStale(entry.updated_at, nowMs);
			if (!stale) return entry;
			const hud = entry.hud;
			if (hud && (hud.severity === "error" || hud.severity === "blocked")) {
				return { ...entry, stale: true };
			}
			const patchedHud = hud
				? { ...hud, severity: "warning" as WorkflowHudSeverity }
				: ({ version: 1, severity: "warning" as WorkflowHudSeverity } as WorkflowHudSummary);
			return { ...entry, stale: true, hud: patchedHud };
		})
		.sort((a, b) => a.skill.localeCompare(b.skill));

	const updatedAt = entries[0]?.updated_at ?? new Date(0).toISOString();

	return {
		version: 1,
		active: activeWorkflows.length > 0,
		updated_at: updatedAt,
		active_workflows: activeWorkflows,
	};
}

/**
 * Collapse the planning pipeline to a single entry — the most recently updated
 * stage — so the HUD doesn't show stale upstream skills after a downstream
 * skill has taken over. Non-pipeline skills are unaffected.
 *
 * (Aligned with gajae-code's `collapsePlanningPipeline`.)
 */
export function collapsePlanningPipeline(entries: readonly WorkflowActiveEntry[]): WorkflowActiveEntry[] {
	const pipeline = entries.filter((entry) => PLANNING_PIPELINE_SKILLS.has(entry.skill));
	if (pipeline.length <= 1) return [...entries];
	let current = pipeline[0];
	let currentRecency = entryRecency(current);
	for (const entry of pipeline) {
		const recency = entryRecency(entry);
		const better = Number.isFinite(recency) && (!Number.isFinite(currentRecency) || recency > currentRecency);
		if (better) {
			current = entry;
			currentRecency = recency;
		}
	}
	return entries.filter((entry) => !PLANNING_PIPELINE_SKILLS.has(entry.skill) || entry === current);
}

export function formatWorkflowHudLine(entry: WorkflowActiveEntry): string {
	const prefix = entry.stale ? "[stale] " : "";
	const chips = entry.hud?.chips
		?.slice()
		.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
		.map((chip) => `${chip.label}${chip.value ? `=${chip.value}` : ""}`)
		.join(" ");
	return [`${prefix}${entry.skill}`, entry.phase, chips].filter(Boolean).join(" | ");
}

/** Entry passed to `applyHandoffToActiveState` for the caller (demoted) side. */
export interface HandoffSide {
	skill: WorkflowSkill;
	phase?: string;
	state_path?: string;
	hud?: WorkflowHudSummary;
}

/** Options for `applyHandoffToActiveState`. sessionId is required. */
export interface ApplyHandoffOptions {
	cwd: string;
	/** Skill being demoted (handing off). */
	caller: HandoffSide;
	/** Skill being promoted (receiving the handoff). */
	callee: HandoffSide;
	/** Session id to tag both entries with. Omit to use legacy global active state. */
	sessionId?: string;
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
	const sessionId = options.sessionId?.trim() || undefined;
	const tag = sessionId ? { session_id: sessionId } : {};

	const callerEntry: WorkflowActiveEntry = {
		...options.caller,
		active: false,
		updated_at: now,
		...tag,
		handoff_to: options.callee.skill,
		handoff_at: now,
		...(options.caller.hud ? { hud: normalizeWorkflowHudSummary(options.caller.hud) } : {}),
	};
	const calleeEntry: WorkflowActiveEntry = {
		...options.callee,
		active: true,
		updated_at: now,
		...tag,
		handoff_from: options.caller.skill,
		handoff_at: now,
		...(options.callee.hud ? { hud: normalizeWorkflowHudSummary(options.callee.hud) } : {}),
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
