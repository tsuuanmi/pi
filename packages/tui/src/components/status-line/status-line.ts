import { renderHudBar } from "#tui/components/hud/render";
import { LAYOUT_EDGE_X } from "#tui/components/layout/spacing";
import { type GitStatusSummary, runGitStatusPorcelain } from "#tui/components/status-line/git-utils";
import { getPreset } from "#tui/components/status-line/presets";
import { computeUsageStats, renderSegment, sanitizeStatusText } from "#tui/components/status-line/segments";
import { getSeparator } from "#tui/components/status-line/separators";
import type {
	SegmentContext,
	StatusLineComponentOptions,
	StatusLineDataProvider,
	StatusLineHudEntry,
	StatusLineSegmentId,
	StatusLineSegmentOptions,
	StatusLineSessionLike,
	StatusLineSettings,
} from "#tui/components/status-line/types";
import type { Component } from "#tui/core/tui";
import { TUI_COLOR_PROFILE, theme } from "#tui/theme/theme";
import { truncateToWidth, visibleWidth } from "#tui/utilities/text";

/** Minimum gap (columns) between the left and right rail groups. */
const MIN_PADDING = 2;
/** Background-refresh interval for the git porcelain cache. */
const GIT_STATUS_REFRESH_MS = 30_000;
/** Background-refresh interval for the HUD cache. */
const HUD_REFRESH_MS = 1000;

function areGitStatusSummariesEqual(a: GitStatusSummary | null, b: GitStatusSummary | null): boolean {
	return (
		a === b || Boolean(a && b && a.staged === b.staged && a.unstaged === b.unstaged && a.untracked === b.untracked)
	);
}

/**
 * Status line component: renders the configurable segment rail and appends HUD
 * and hook status details inline when present. Replaces `FooterComponent`.
 *
 * Reuses `FooterDataProvider` for the git branch (`.git/HEAD` watch), extension
 * statuses, and available provider count — it does NOT re-implement the git watcher.
 * The only background refresh it owns is the
 * `git status --porcelain` counts cache (30s refresh) and the HUD entry HUD
 * cache (1s refresh, error-resilient).
 */
export class StatusLineComponent implements Component {
	#session: StatusLineSessionLike;
	#footerData: StatusLineDataProvider;
	#settingsSource: { getStatusLine(): StatusLineSettings };
	#requestRender: (() => void) | null;
	#readHudEntries: StatusLineComponentOptions["readHudEntries"];
	#autoCompactEnabled = true;

	// Git porcelain counts cache (30s refresh). `null` until the first fetch.
	#cachedGitStatus: GitStatusSummary | null = null;
	#cachedGitStatusCwd: string | null = null;
	#gitStatusLastFetch = 0;
	#gitStatusInFlight = false;

	// HUD cache (1s refresh). `[]` until the first successful read.
	#hudEntries: StatusLineHudEntry[] = [];
	#hudLastFetch = 0;
	#hudInFlight = false;

	constructor(
		session: StatusLineSessionLike,
		footerData: StatusLineDataProvider,
		settingsSource: { getStatusLine(): StatusLineSettings },
		requestRender: () => void,
		options: StatusLineComponentOptions = {},
	) {
		this.#session = session;
		this.#footerData = footerData;
		this.#settingsSource = settingsSource;
		this.#requestRender = requestRender;
		this.#readHudEntries = options.readHudEntries;
	}

	setSession(session: StatusLineSessionLike): void {
		this.#session = session;
	}

	setAutoCompactEnabled(enabled: boolean): void {
		this.#autoCompactEnabled = enabled;
	}

	/** Keep git porcelain refreshes time-based; callers invalidate the surrounding TUI render separately. */
	invalidate(): void {}

	dispose(): void {
		// No watcher to close — FooterDataProvider owns the .git/HEAD watcher.
		this.#requestRender = null;
	}

	render(width: number): string[] {
		const settings = this.#settingsSource.getStatusLine();
		const parts: string[] = [];

		// Keep HUD, rail, and hook status compacted onto one bottom line.
		this.#refreshHudInBackground();
		this.#refreshGitStatusInBackground();
		const edgeX = Math.min(LAYOUT_EDGE_X, Math.max(0, Math.floor((width - 1) / 2)));
		const contentWidth = Math.max(1, width - edgeX * 2);
		if (settings.showHud !== false) {
			const hud = renderHudBar(this.#hudEntries, contentWidth);
			if (hud) parts.push(hud.trimEnd());
		}

		const rail = this.#buildStatusLine(contentWidth, settings);
		if (rail) parts.push(rail.trimEnd());

		const hook = this.#buildHookLine(contentWidth);
		if (hook) parts.push(hook);

		if (parts.length === 0) return [];
		const content = truncateToWidth(
			parts.join(theme.fg(TUI_COLOR_PROFILE.statusLine.separator, " │ ")),
			contentWidth,
		);
		const rightPadding = " ".repeat(Math.max(0, width - edgeX - visibleWidth(content)));
		return [`${" ".repeat(edgeX)}${content}${rightPadding}`];
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Background refresh
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Kick a background `git status --porcelain` fetch if the cache is stale
	 * (30s refresh) and none is in flight. `runGitStatusPorcelain` is
	 * error-resilient, so this cannot throw on the render path.
	 */
	#refreshGitStatusInBackground(): void {
		const cwd = this.#session.sessionManager.getCwd();
		if (this.#cachedGitStatusCwd !== null && this.#cachedGitStatusCwd !== cwd) {
			this.#cachedGitStatus = null;
			this.#cachedGitStatusCwd = null;
			this.#gitStatusLastFetch = 0;
		}
		if (this.#gitStatusInFlight || Date.now() - this.#gitStatusLastFetch < GIT_STATUS_REFRESH_MS) {
			return;
		}
		this.#gitStatusInFlight = true;
		void (async () => {
			try {
				const result = await runGitStatusPorcelain(cwd);
				const shouldRender = !areGitStatusSummariesEqual(this.#cachedGitStatus, result);
				this.#cachedGitStatus = result;
				this.#cachedGitStatusCwd = cwd;
				this.#gitStatusLastFetch = Date.now();
				if (shouldRender) this.#requestRender?.();
			} catch {
				// runGitStatusPorcelain never rejects, but guard defensively.
			} finally {
				this.#gitStatusInFlight = false;
			}
		})();
	}

	/**
	 * Kick a background HUD entry read if the HUD cache is stale (1s refresh)
	 * and none is in flight. The read is wrapped so provider failures never
	 * throw on the render path; on failure `#hudEntries` is left unchanged.
	 */
	#refreshHudInBackground(): void {
		if (this.#hudInFlight || Date.now() - this.#hudLastFetch < HUD_REFRESH_MS) {
			return;
		}
		this.#hudInFlight = true;
		const cwd = this.#session.sessionManager.getCwd();
		const sessionId = this.#session.sessionId ?? "";
		const readHudEntries = this.#readHudEntries;
		void (async () => {
			try {
				const entries = readHudEntries ? await readHudEntries({ cwd, sessionId }) : [];
				this.#hudEntries = [...(entries ?? [])];
			} catch {
				// Leave #hudEntries unchanged (initially [] until a valid read).
			} finally {
				this.#hudLastFetch = Date.now();
				this.#hudInFlight = false;
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
			hudPhase: this.#hudEntries[0]?.phase,
		};
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Rail assembly
	// ═══════════════════════════════════════════════════════════════════════════

	#buildStatusLine(width: number, settings: StatusLineSettings): string {
		const resolved = this.#resolveSettings(settings);
		const ctx = this.#buildSegmentContext(width, resolved.segmentOptions);
		const sep = resolved.separator;
		const sepRendered = theme.fg(TUI_COLOR_PROFILE.statusLine.separator, ` ${sep.left} `);

		// Collect visible right segments.
		const rightParts: string[] = [];
		for (const segId of resolved.rightSegments) {
			const rendered = renderSegment(segId, ctx);
			if (rendered.visible && rendered.content) rightParts.push(rendered.content);
		}

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
		const rightGroup = join(rightParts);

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

		if (parts.length === 0) return "";
		return truncateToWidth(parts.join(" "), width);
	}
}
