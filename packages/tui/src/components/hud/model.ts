export type HudSeverity = "info" | "warning" | "blocked" | "error" | "success";

export interface HudChip {
	label: string;
	value?: string;
	priority?: number;
	severity?: HudSeverity;
}

export interface HudSummary {
	version: 1;
	summary?: string;
	chips?: HudChip[];
	details?: HudChip[];
	severity?: HudSeverity;
	updated_at?: string;
}

export interface HudLineEntry {
	id: string;
	phase?: string;
	stale?: boolean;
	hud?: HudSummary;
}

export interface ActiveHudEntry extends HudLineEntry {
	active: boolean;
	updated_at?: string;
}

export function hudChip(
	label: string,
	value: string | number | boolean,
	priority: number,
	severity?: HudSeverity,
): HudChip {
	return {
		label,
		value: String(value),
		priority,
		...(severity ? { severity } : {}),
	};
}

export function progressChip(done: number, total: number, priority = 25): HudChip {
	return hudChip("progress", `${done}/${total}`, priority);
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

export function normalizeHudSeverity(value: unknown): HudSeverity | undefined {
	return value === "info" || value === "warning" || value === "blocked" || value === "error" || value === "success"
		? value
		: undefined;
}

export function normalizeHudChip(value: unknown): HudChip | undefined {
	if (!isPlainObject(value)) return undefined;
	const label = sanitizeText(value.label, 32);
	if (!label) return undefined;
	const normalizedValue = sanitizeText(value.value, 80);
	const severity = normalizeHudSeverity(value.severity);
	const priority = typeof value.priority === "number" && Number.isFinite(value.priority) ? value.priority : undefined;
	return {
		label,
		...(normalizedValue ? { value: normalizedValue } : {}),
		...(priority !== undefined ? { priority } : {}),
		...(severity ? { severity } : {}),
	};
}

export function normalizeHudSummary(value: unknown): HudSummary | undefined {
	if (!isPlainObject(value) || value.version !== 1) return undefined;
	const chips = Array.isArray(value.chips)
		? value.chips
				.map(normalizeHudChip)
				.filter((chip): chip is HudChip => chip !== undefined)
				.slice(0, 6)
		: undefined;
	const details = Array.isArray(value.details)
		? value.details
				.map(normalizeHudChip)
				.filter((chip): chip is HudChip => chip !== undefined)
				.slice(0, 12)
		: undefined;
	const summary = sanitizeText(value.summary, 120);
	const severity = normalizeHudSeverity(value.severity);
	const updatedAt = sanitizeText(value.updated_at, 40);
	return {
		version: 1,
		...(summary ? { summary } : {}),
		...(chips && chips.length > 0 ? { chips } : {}),
		...(details && details.length > 0 ? { details } : {}),
		...(severity ? { severity } : {}),
		...(updatedAt ? { updated_at: updatedAt } : {}),
	};
}

export function applyHudStatusFlags<T extends { hud?: HudSummary; stale?: boolean }>(
	entry: T,
	options: { stale?: boolean } = {},
): T {
	if (!options.stale) return entry;
	const hud = entry.hud;
	if (hud && (hud.severity === "error" || hud.severity === "blocked")) {
		return { ...entry, stale: true };
	}
	const patchedHud = hud
		? { ...hud, severity: "warning" as HudSeverity }
		: ({ version: 1, severity: "warning" as HudSeverity } as HudSummary);
	return { ...entry, stale: true, hud: patchedHud };
}

export function formatHudLine(entry: HudLineEntry): string {
	const prefix = entry.stale ? "[stale] " : "";
	const chips = entry.hud?.chips
		?.slice()
		.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
		.map((chip) => `${chip.label}${chip.value ? `=${chip.value}` : ""}`)
		.join(" ");
	return [`${prefix}${entry.id}`, entry.phase, chips].filter(Boolean).join(" | ");
}
