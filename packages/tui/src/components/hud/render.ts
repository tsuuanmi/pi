import type { StatusLineHudChip, StatusLineHudEntry } from "#tui/components/status-line/types";

const ANSI_RESET_FG = "\x1b[39m";
const ANSI_RESET_INTENSITY = "\x1b[22m";
const ANSI_ACCENT = "\x1b[36m";
const ANSI_DIM = "\x1b[2m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_WARNING = "\x1b[33m";
const ANSI_ERROR = "\x1b[31m";
const ANSI_BLOCKED = "\x1b[35m";
const ANSI_SUCCESS = "\x1b[32m";
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
function visibleWidth(text: string): number {
	return text.replace(ANSI_PATTERN, "").length;
}

function truncateToWidth(text: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(text) <= maxWidth) return text;
	const plain = text.replace(ANSI_PATTERN, "");
	if (maxWidth === 1) return "…";
	return `${plain.slice(0, maxWidth - 1)}…`;
}

function sanitizeHudPart(value: string | undefined): string {
	return (value ?? "")
		.replace(ANSI_PATTERN, "")
		.replace(/[\r\n\t]+/g, " ")
		.trim();
}

function compareEntries(a: StatusLineHudEntry, b: StatusLineHudEntry): number {
	return a.id.localeCompare(b.id) || (a.phase ?? "").localeCompare(b.phase ?? "");
}

function compareChips(a: StatusLineHudChip, b: StatusLineHudChip): number {
	return (a.priority ?? 50) - (b.priority ?? 50) || a.label.localeCompare(b.label);
}

function severityColor(chip: StatusLineHudChip): string {
	if (chip.severity === "error") return ANSI_ERROR;
	if (chip.severity === "blocked") return ANSI_BLOCKED;
	if (chip.severity === "warning") return ANSI_WARNING;
	if (chip.severity === "success") return ANSI_SUCCESS;
	return ANSI_ACCENT;
}

function chipPrefix(chip: StatusLineHudChip): string {
	if (chip.severity === "error") return "!";
	if (chip.severity === "blocked") return "block";
	if (chip.severity === "warning") return "warn";
	return "";
}

function styleBase(value: string): string {
	return `${ANSI_BOLD}${ANSI_ACCENT}${value}${ANSI_RESET_FG}${ANSI_RESET_INTENSITY}`;
}

function styleLabel(value: string): string {
	return `${ANSI_DIM}${value}${ANSI_RESET_INTENSITY}`;
}

function styleValue(value: string, color = ANSI_ACCENT): string {
	return `${ANSI_BOLD}${color}${value}${ANSI_RESET_FG}${ANSI_RESET_INTENSITY}`;
}

function formatChip(chip: StatusLineHudChip): string | null {
	const label = sanitizeHudPart(chip.label);
	const value = sanitizeHudPart(chip.value);
	if (!label) return null;
	const prefix = chipPrefix(chip);
	const displayLabel = prefix ? `${prefix}:${label}` : label;
	if (!value) return styleLabel(displayLabel);
	return `${styleLabel(displayLabel)}=${styleValue(value, severityColor(chip))}`;
}

function formatEntry(entry: StatusLineHudEntry): string {
	const id = sanitizeHudPart(entry.id);
	const chips = [...(entry.hud?.chips ?? [])]
		.sort(compareChips)
		.map(formatChip)
		.filter((chip): chip is string => Boolean(chip));
	if (entry.stale === true) chips.unshift(`${styleLabel("warn:stale")}`);
	const summary = sanitizeHudPart(entry.hud?.summary);
	return [styleBase(id), summary ? styleValue(summary) : "", ...chips].filter(Boolean).join("  ");
	// Keep rendering limited to generic entry fields and caller-provided chips.
}

/**
 * Render the HUD bar for the active HUD entries.
 *
 * Returns the styled single line, or null when there are no visible active
 * entries (or width <= 0).
 */
export function renderHudBar(entries: readonly StatusLineHudEntry[], width: number): string | null {
	const visible = entries.filter((entry) => entry.active !== false);
	const active = visible.filter((entry) => sanitizeHudPart(entry.id)).sort(compareEntries);
	if (active.length === 0 || width <= 0) return null;
	const body = active.map(formatEntry).join(`${ANSI_DIM} + ${ANSI_RESET_INTENSITY}`);
	return truncateToWidth(body, width);
}
