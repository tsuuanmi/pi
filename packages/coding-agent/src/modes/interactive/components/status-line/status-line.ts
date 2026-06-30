import { type Component, truncateToWidth, visibleWidth } from "@tsuuanmi/pi-tui";
import type { AgentSession } from "../../../../core/agent-session/agent-session.ts";
import { areExperimentalFeaturesEnabled } from "../../../../core/config/experimental.ts";
import type {
	SettingsManager,
	StatusLineSegmentId,
	StatusLineSegmentOptions,
	StatusLineSettings,
} from "../../../../core/settings/settings-manager.ts";
import type { ReadonlyFooterDataProvider } from "../../../../core/usage/footer-data-provider.ts";
import {
	collapsePlanningPipeline,
	readWorkflowActiveState,
	type WorkflowActiveEntry,
} from "@tsuuanmi/pi-workflows";
import { theme } from "../../../../theme/theme.ts";
import { renderSkillHudBar } from "../skill-hud/render.ts";
import { type GitStatusSummary, runGitStatusPorcelain } from "./git-utils.ts";
import { getPreset } from "./presets.ts";
import { computeUsageStats, renderSegment, sanitizeStatusText } from "./segments.ts";
import { getSeparator } from "./separators.ts";
import type { SegmentContext } from "./types.ts";

/** Minimum gap (columns) between the left and right rail groups. */
const MIN_PADDING = 2;
/** Background-refresh debounce for both the git porcelain cache and the HUD. */
const REFRESH_DEBOUNCE_MS = 1000;

/**
 * Status line component: renders the skill HUD line (when workflows are
 * active), the configurable segment rail, and the non-workflow hook status
 * line. Replaces `FooterComponent`.
 *
 * Reuses `FooterDataProvider` for the git branch (`.git/HEAD` watch), extension
 * statuses, available provider count, and Codex quota summary — it does NOT
 * re-implement the git watcher. The only background refresh it owns is the
 * `git status --porcelain` counts cache (1s debounce, generation-guarded) and
 * the workflow active-state HUD cache (1s debounce, error-resilient).
 */
export class StatusLineComponent implements Component {
	#session: AgentSession;
	#footerData: ReadonlyFooterDataProvider;
	#settingsManager: SettingsManager;
	#requestRender: (() => void) | null;
	#autoCompactEnabled = true;

	// Git porcelain counts cache (1s debounce). `null` until the first fetch.
	#cachedGitStatus: GitStatusSummary | null = null;
	#gitStatusLastFetch = 0;
	#gitStatusInFlight = false;
	// Bumped on invalidate() so a fetch started before a branch switch cannot
	// overwrite the newer cache state.
	#gitGeneration = 0;

	// Workflow HUD cache (1s debounce). `[]` until the first successful read.
	#skillHudEntries: WorkflowActiveEntry[] = [];
	#skillHudLastFetch = 0;
	#skillHudInFlight = false;

	constructor(
		session: AgentSession,
		footerData: ReadonlyFooterDataProvider,
		settingsManager: SettingsManager,
		requestRender: () => void,
	) {
		this.#session = session;
		this.#footerData = footerData;
		this.#settingsManager = settingsManager;
		this.#requestRender = requestRender;
	}

	setSession(session: AgentSession): void {
		this.#session = session;
	}

	setAutoCompactEnabled(enabled: boolean): void {
		this.#autoCompactEnabled = enabled;
	}

	/** Invalidate the git porcelain cache so the next render re-fetches. */
	invalidate(): void {
		this.#cachedGitStatus = null;
		this.#gitStatusLastFetch = 0;
		this.#gitGeneration += 1;
	}

	dispose(): void {
		// No watcher to close — FooterDataProvider owns the .git/HEAD watcher.
		this.#requestRender = null;
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const settings = this.#settingsManager.getStatusLine();

		// 1. HUD line (gajae-style `◆ hud ...`), only when workflows are active.
		this.#refreshSkillHudInBackground();
		if (settings.showSkillHud !== false) {
			const hud = renderSkillHudBar(this.#skillHudEntries, width);
			if (hud) lines.push(hud);
		}

		// 2. Rail (left group / right group + xp trailing chip).
		this.#refreshGitStatusInBackground();
		const rail = this.#buildStatusLine(width, settings);
		if (rail) lines.push(rail);

		// 3. Hook status line (non-workflow extension statuses + Codex quota).
		const hook = this.#buildHookLine(width);
		if (hook) lines.push(hook);

		return lines;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Background refresh
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Kick a background `git status --porcelain` fetch if the cache is stale
	 * (1s debounce) and none is in flight. `runGitStatusPorcelain` is
	 * error-resilient, so this cannot throw on the render path.
	 */
	#refreshGitStatusInBackground(): void {
		if (this.#gitStatusInFlight || Date.now() - this.#gitStatusLastFetch < REFRESH_DEBOUNCE_MS) {
			return;
		}
		this.#gitStatusInFlight = true;
		const generation = this.#gitGeneration;
		const cwd = this.#session.sessionManager.getCwd();
		void (async () => {
			try {
				const result = await runGitStatusPorcelain(cwd);
				// Discard the result if invalidate() bumped the generation since the
				// fetch started (branch switched mid-fetch).
				if (generation !== this.#gitGeneration) {
					// Release the in-flight guard, leave the cache untouched, and request
					// a re-render so the next render re-fetches immediately.
					this.#gitStatusInFlight = false;
					this.#requestRender?.();
					return;
				}
				this.#cachedGitStatus = result;
				this.#gitStatusLastFetch = Date.now();
				this.#gitStatusInFlight = false;
				this.#requestRender?.();
			} catch {
				// runGitStatusPorcelain never rejects, but guard defensively.
				this.#gitStatusInFlight = false;
			}
		})();
	}

	/**
	 * Kick a background workflow active-state read if the HUD cache is stale
	 * (1s debounce) and none is in flight. The read + pipeline collapse are
	 * wrapped so workflow-state failures never throw on the render path; on
	 * failure `#skillHudEntries` is left unchanged.
	 */
	#refreshSkillHudInBackground(): void {
		if (this.#skillHudInFlight || Date.now() - this.#skillHudLastFetch < REFRESH_DEBOUNCE_MS) {
			return;
		}
		this.#skillHudInFlight = true;
		const cwd = this.#session.sessionManager.getCwd();
		const sessionId = this.#session.sessionId;
		void (async () => {
			try {
				const state = await readWorkflowActiveState(cwd, { sessionId });
				this.#skillHudEntries = collapsePlanningPipeline(state?.active_workflows ?? []);
			} catch {
				// Leave #skillHudEntries unchanged (initially [] until a valid read).
			} finally {
				this.#skillHudLastFetch = Date.now();
				this.#skillHudInFlight = false;
				this.#requestRender?.();
			}
		})();
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Settings resolution + context
	// ═══════════════════════════════════════════════════════════════════════════

	#resolveSettings(settings: StatusLineSettings): {
		leftSegments: StatusLineSegmentId[];
		rightSegments: StatusLineSegmentId[];
		separator: ReturnType<typeof getSeparator>;
		segmentOptions: StatusLineSegmentOptions;
	} {
		const presetDef = getPreset(settings.preset);
		const mergedOptions: StatusLineSegmentOptions = {};
		for (const [segment, options] of Object.entries(presetDef.segmentOptions ?? {})) {
			mergedOptions[segment as keyof StatusLineSegmentOptions] = { ...(options as object) };
		}
		for (const [segment, options] of Object.entries(settings.segmentOptions ?? {})) {
			const current = mergedOptions[segment as keyof StatusLineSegmentOptions] ?? {};
			mergedOptions[segment as keyof StatusLineSegmentOptions] = { ...current, ...options };
		}
		return {
			leftSegments: settings.leftSegments ?? presetDef.leftSegments,
			rightSegments: settings.rightSegments ?? presetDef.rightSegments,
			separator: getSeparator(settings.separator ?? presetDef.separator),
			segmentOptions: mergedOptions,
		};
	}

	#buildSegmentContext(width: number, segmentOptions: StatusLineSegmentOptions): SegmentContext {
		const session = this.#session;
		const state = session.state;
		const contextUsage = session.getContextUsage();
		const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
		return {
			session,
			width,
			options: segmentOptions,
			usageStats: computeUsageStats(session),
			contextPercent: contextUsage?.percent ?? null,
			contextWindow,
			autoCompactEnabled: this.#autoCompactEnabled,
			subagentCount: session.subagentManager?.getActiveCount() ?? 0,
			availableProviderCount: this.#footerData.getAvailableProviderCount(),
			git: {
				branch: this.#footerData.getGitBranch(),
				status: this.#cachedGitStatus,
			},
			workflowPhase: this.#skillHudEntries[0]?.phase,
		};
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Rail assembly
	// ═══════════════════════════════════════════════════════════════════════════

	#buildStatusLine(width: number, settings: StatusLineSettings): string {
		const resolved = this.#resolveSettings(settings);
		const ctx = this.#buildSegmentContext(width, resolved.segmentOptions);
		const sep = resolved.separator;
		const sepRendered = theme.fg("dim", ` ${sep.left} `);

		// Collect visible right segments + the experimental-features chip.
		const rightParts: string[] = [];
		for (const segId of resolved.rightSegments) {
			const rendered = renderSegment(segId, ctx);
			if (rendered.visible && rendered.content) rightParts.push(rendered.content);
		}
		const xpChip = areExperimentalFeaturesEnabled()
			? `${theme.fg("dim", "•")} ${theme.bold(theme.fg("warning", "xp"))}`
			: null;

		// Collect visible left segments (track the model part for the provider fallback).
		const leftParts: string[] = [];
		let modelPartIdx = -1;
		for (const segId of resolved.leftSegments) {
			const rendered = renderSegment(segId, ctx);
			if (rendered.visible && rendered.content) {
				if (segId === "model") modelPartIdx = leftParts.length;
				leftParts.push(rendered.content);
			}
		}

		const join = (parts: string[]): string => parts.join(sepRendered);
		let leftGroup = join(leftParts);
		const rightCore = join(rightParts);
		const rightGroup = xpChip ? (rightCore ? `${rightCore} ${xpChip}` : xpChip) : rightCore;

		let leftWidth = visibleWidth(leftGroup);
		const rightWidth = visibleWidth(rightGroup);

		// If the model segment included a `(provider)` prefix and the rail does not
		// fit, re-render the model segment with the prefix disabled and recompute.
		const providerApplicable =
			modelPartIdx >= 0 &&
			ctx.availableProviderCount > 1 &&
			ctx.options.model?.showProviderPrefix !== false &&
			Boolean(ctx.session.state.model);
		if (providerApplicable && leftWidth + MIN_PADDING + rightWidth > width) {
			const fallbackCtx: SegmentContext = {
				...ctx,
				options: { ...ctx.options, model: { ...ctx.options.model, showProviderPrefix: false } },
			};
			const fallback = renderSegment("model", fallbackCtx);
			if (fallback.visible && fallback.content) {
				leftParts[modelPartIdx] = fallback.content;
				leftGroup = join(leftParts);
				leftWidth = visibleWidth(leftGroup);
			}
		}

		// Truncate the left group if it alone exceeds the available width.
		if (leftWidth > width) {
			leftGroup = truncateToWidth(leftGroup, width, "...");
			leftWidth = visibleWidth(leftGroup);
		}

		// Omit the right group entirely when there is no room for the minimum gap.
		if (width - leftWidth < MIN_PADDING || rightWidth === 0) {
			return leftGroup;
		}

		const totalNeeded = leftWidth + MIN_PADDING + rightWidth;
		if (totalNeeded <= width) {
			const padding = " ".repeat(width - leftWidth - rightWidth);
			return leftGroup + padding + rightGroup;
		}

		// Right group too wide: truncate it to the available space.
		const availableForRight = width - leftWidth - MIN_PADDING;
		if (availableForRight > 0) {
			const truncatedRight = truncateToWidth(rightGroup, availableForRight, "");
			const padding = " ".repeat(Math.max(0, width - leftWidth - visibleWidth(truncatedRight)));
			return leftGroup + padding + truncatedRight;
		}
		return leftGroup;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Hook status line
	// ═══════════════════════════════════════════════════════════════════════════

	#buildHookLine(width: number): string {
		const parts: string[] = [];

		const statuses = this.#footerData.getExtensionStatuses();
		if (statuses.size > 0) {
			const text = Array.from(statuses.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([, text]) => sanitizeStatusText(text))
				.join(" ");
			if (text) parts.push(`Status: ${text}`);
		}

		// Codex quota only applies to the OpenAI Codex provider.
		if (this.#session.state.model?.provider === "openai-codex") {
			const codex = this.#footerData.getCodexUsageSummary();
			if (codex) {
				const quotaText =
					codex.status === "exhausted"
						? theme.fg("error", codex.text)
						: codex.status === "warning"
							? theme.fg("warning", codex.text)
							: codex.text;
				parts.push(`Quota: ${quotaText}`);
			}
		}

		if (parts.length === 0) return "";
		return truncateToWidth(parts.join(" "), width);
	}
}
