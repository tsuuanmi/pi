import { type WorkflowSkill, workflowActiveStatePath } from "./paths.ts";
import { readExistingStateForMutation, writeJsonAtomic } from "./state-writer.ts";

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
	hud?: WorkflowHudSummary;
	state_path?: string;
}

export interface WorkflowActiveState {
	version: 1;
	active: boolean;
	updated_at: string;
	active_workflows: WorkflowActiveEntry[];
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

export function normalizeWorkflowHudSummary(value: unknown): WorkflowHudSummary | undefined {
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
		...(normalizeWorkflowHudSummary(value.hud) ? { hud: normalizeWorkflowHudSummary(value.hud) } : {}),
		...(sanitizeText(value.state_path, 240) ? { state_path: sanitizeText(value.state_path, 240) } : {}),
	};
}

export async function readWorkflowActiveState(cwd: string): Promise<WorkflowActiveState | undefined> {
	const read = await readExistingStateForMutation(workflowActiveStatePath(cwd));
	if (read.kind === "absent") return undefined;
	if (read.kind === "corrupt") throw new Error(`workflow active state is corrupt: ${read.error}`);
	const activeWorkflows = Array.isArray(read.value.active_workflows)
		? read.value.active_workflows
				.map(normalizeEntry)
				.filter((entry): entry is WorkflowActiveEntry => entry !== undefined)
		: [];
	return {
		version: 1,
		active: activeWorkflows.some((entry) => entry.active),
		updated_at: sanitizeText(read.value.updated_at, 40) ?? new Date(0).toISOString(),
		active_workflows: activeWorkflows.filter((entry) => entry.active),
	};
}

export async function syncWorkflowActiveState(
	cwd: string,
	entry: Omit<WorkflowActiveEntry, "updated_at"> & { updated_at?: string },
): Promise<WorkflowActiveState> {
	const now = entry.updated_at ?? new Date().toISOString();
	const prior = await readWorkflowActiveState(cwd).catch(() => undefined);
	const nextEntry: WorkflowActiveEntry = {
		...entry,
		updated_at: now,
		...(entry.hud ? { hud: normalizeWorkflowHudSummary(entry.hud) } : {}),
	};
	const merged = new Map<WorkflowSkill, WorkflowActiveEntry>();
	for (const item of prior?.active_workflows ?? []) merged.set(item.skill, item);
	if (nextEntry.active) merged.set(nextEntry.skill, nextEntry);
	else merged.delete(nextEntry.skill);
	const activeWorkflows = [...merged.values()].sort((a, b) => a.skill.localeCompare(b.skill));
	const state: WorkflowActiveState = {
		version: 1,
		active: activeWorkflows.length > 0,
		updated_at: now,
		active_workflows: activeWorkflows,
	};
	await writeJsonAtomic(workflowActiveStatePath(cwd), { ...state }, { cwd });
	return state;
}

export function formatWorkflowHudLine(entry: WorkflowActiveEntry): string {
	const chips = entry.hud?.chips
		?.slice()
		.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
		.map((chip) => `${chip.label}${chip.value ? `=${chip.value}` : ""}`)
		.join(" ");
	return [entry.skill, entry.phase, chips].filter(Boolean).join(" | ");
}
