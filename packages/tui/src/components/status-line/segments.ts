import { isAbsolute, relative, resolve, sep } from "node:path";
import { getContextUsageLevel, getContextUsageThemeColor } from "#tui/components/status-line/context-thresholds";
import type {
	RenderedSegment,
	SegmentContext,
	StatusLineSegment,
	StatusLineSegmentId,
} from "#tui/components/status-line/types";
import type { ThemeColor } from "#tui/theme/theme";
import { theme } from "#tui/theme/theme";

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers (relocated from footer.ts)
// ═══════════════════════════════════════════════════════════════════════════

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const C0_CONTROL_PATTERN = /[\x00-\x1f\x7f]/g;

/**
 * Sanitize text for single-line status display.
 *
 * Strips ANSI escape sequences first, then replaces all C0 control characters
 * (0x00-0x1f) and DEL (0x7f) with a space, collapses runs of spaces, and
 * trims. This prevents raw escape sequences from leaking into the terminal.
 */
export function sanitizeStatusText(text: string): string {
	return text.replace(ANSI_PATTERN, " ").replace(C0_CONTROL_PATTERN, " ").replace(/ +/g, " ").trim();
}

/** Format token counts for compact status display. */
export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

/** Abbreviate a cwd for display: replace the home directory prefix with `~`. */
export function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

/** Map a thinking level to its Pi theme color token. */
function thinkingColorToken(level: string): ThemeColor {
	switch (level) {
		case "minimal":
			return "thinkingMinimal";
		case "low":
			return "thinkingLow";
		case "medium":
			return "thinkingMedium";
		case "high":
			return "thinkingHigh";
		case "xhigh":
			return "thinkingXhigh";
		default:
			return "thinkingOff";
	}
}

/** Cumulative input/output usage across all session entries. */
export function computeUsageStats(session: SegmentContext["session"]): { input: number; output: number } {
	let input = 0;
	let output = 0;
	for (const entry of session.sessionManager.getEntries()) {
		if (entry.type === "message" && entry.message?.role === "assistant") {
			input += entry.message.usage?.input ?? 0;
			output += entry.message.usage?.output ?? 0;
		}
	}
	return { input, output };
}

// ═══════════════════════════════════════════════════════════════════════════
// Segment Implementations
// ═══════════════════════════════════════════════════════════════════════════
// Pi keeps the gajae segment shape but renders with Pi's existing theme tokens
// and plain text where gajae has product-specific icons/colors.

const modelSegment: StatusLineSegment = {
	id: "model",
	render(ctx) {
		const state = ctx.session.state;
		const opts = ctx.options.model ?? {};

		const modelName = state.model?.name || state.model?.id || "no-model";

		// Prepend `(provider)` when more than one provider is available and the
		// option is enabled. Width fallback is applied by StatusLineComponent by
		// re-rendering this segment with showProviderPrefix=false.
		let prefix = "";
		if (ctx.availableProviderCount > 1 && opts.showProviderPrefix !== false && state.model) {
			prefix = `(${state.model.provider}) `;
		}

		let content = `${prefix}${modelName}`;

		// Fold the thinking level into the model segment (default: shown).
		if (opts.showThinkingLevel !== false && state.model?.reasoning) {
			const level = state.thinkingLevel ?? "off";
			if (level !== "off") {
				content += ` ${theme.fg("dim", "•")} ${theme.fg(thinkingColorToken(level), level)}`;
			}
		}

		return { content: theme.fg("dim", content), visible: true };
	},
};

const modeSegment: StatusLineSegment = {
	id: "mode",
	render(ctx) {
		const phase = ctx.hudPhase;
		if (!phase) return { content: "", visible: false };
		return { content: theme.fg("accent", phase), visible: true };
	},
};

const pathSegment: StatusLineSegment = {
	id: "path",
	render(ctx) {
		const opts = ctx.options.path ?? {};

		const cwd = ctx.session.sessionManager.getCwd();
		let pwd = opts.abbreviate === false ? cwd : formatCwdForFooter(cwd, process.env.HOME || process.env.USERPROFILE);

		const maxLen = opts.maxLength ?? 40;
		if (pwd.length > maxLen) {
			const ellipsis = "…";
			pwd = `${ellipsis}${pwd.slice(-Math.max(0, maxLen - ellipsis.length))}`;
		}

		return { content: theme.fg("dim", pwd), visible: true };
	},
};

const gitSegment: StatusLineSegment = {
	id: "git",
	render(ctx) {
		const { branch, status } = ctx.git;
		// Hidden when neither branch nor status is available (non-git cwd or all
		// fetches failed).
		if (!branch && !status) return { content: "", visible: false };

		const opts = ctx.options.git ?? {};
		const gitStatus = status;
		const isDirty = Boolean(gitStatus && (gitStatus.staged > 0 || gitStatus.unstaged > 0 || gitStatus.untracked > 0));

		let content = "";
		if (opts.showBranch !== false && branch) {
			content = branch;
		}

		if (gitStatus) {
			const indicators: string[] = [];
			if (opts.showUnstaged !== false && gitStatus.unstaged > 0) {
				indicators.push(`*${gitStatus.unstaged}`);
			}
			if (opts.showStaged !== false && gitStatus.staged > 0) {
				indicators.push(`+${gitStatus.staged}`);
			}
			if (opts.showUntracked !== false && gitStatus.untracked > 0) {
				indicators.push(`?${gitStatus.untracked}`);
			}
			if (indicators.length > 0) {
				content = content ? `${content} ${indicators.join(" ")}` : indicators.join(" ");
			}
		}

		if (!content) return { content: "", visible: false };

		const color: ThemeColor = isDirty ? "warning" : "dim";
		return { content: theme.fg(color, content), visible: true };
	},
};

const contextPctSegment: StatusLineSegment = {
	id: "context_pct",
	render(ctx) {
		const pct = ctx.contextPercent;
		const window = ctx.contextWindow;
		const autoIndicator = ctx.autoCompactEnabled ? " (auto)" : "";

		const known = pct !== null && Number.isFinite(pct);
		const pctText = known ? `${pct.toFixed(1)}%` : "?";
		const text = `${pctText}/${formatTokens(window)}${autoIndicator}`;

		const level = known ? getContextUsageLevel(pct, window) : "normal";
		const color = getContextUsageThemeColor(level);
		return { content: theme.fg(color, text), visible: true };
	},
};

const contextTotalSegment: StatusLineSegment = {
	id: "context_total",
	render(ctx) {
		const window = ctx.contextWindow;
		if (!window) return { content: "", visible: false };
		return { content: theme.fg("dim", formatTokens(window)), visible: true };
	},
};

const tokenInSegment: StatusLineSegment = {
	id: "token_in",
	render(ctx) {
		const { input } = ctx.usageStats;
		if (!input) return { content: "", visible: false };
		return { content: theme.fg("muted", `↑${formatTokens(input)}`), visible: true };
	},
};

const tokenOutSegment: StatusLineSegment = {
	id: "token_out",
	render(ctx) {
		const { output } = ctx.usageStats;
		if (!output) return { content: "", visible: false };
		return { content: theme.fg("muted", `↓${formatTokens(output)}`), visible: true };
	},
};

const sessionNameSegment: StatusLineSegment = {
	id: "session_name",
	render(ctx) {
		const name = ctx.session.sessionManager.getSessionName();
		if (!name) return { content: "", visible: false };
		return { content: theme.fg("accent", sanitizeStatusText(name)), visible: true };
	},
};

const subagentsSegment: StatusLineSegment = {
	id: "subagents",
	render(ctx) {
		if (ctx.subagentCount === 0) return { content: "", visible: false };
		return { content: theme.fg("muted", `↳${ctx.subagentCount}`), visible: true };
	},
};

// ═══════════════════════════════════════════════════════════════════════════
// Segment Registry
// ═══════════════════════════════════════════════════════════════════════════

export const SEGMENTS: Record<StatusLineSegmentId, StatusLineSegment> = {
	model: modelSegment,
	mode: modeSegment,
	git: gitSegment,
	path: pathSegment,
	context_pct: contextPctSegment,
	context_total: contextTotalSegment,
	token_in: tokenInSegment,
	token_out: tokenOutSegment,
	session_name: sessionNameSegment,
	subagents: subagentsSegment,
};

export function renderSegment(id: StatusLineSegmentId, ctx: SegmentContext): RenderedSegment {
	const segment = SEGMENTS[id];
	if (!segment) {
		return { content: "", visible: false };
	}
	return segment.render(ctx);
}

export const ALL_SEGMENT_IDS: StatusLineSegmentId[] = Object.keys(SEGMENTS) as StatusLineSegmentId[];
