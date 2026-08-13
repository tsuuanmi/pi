import type { Component } from "#tui/components/component";
import { renderHudBar } from "#tui/components/hud/render";
import { LAYOUT_EDGE_X } from "#tui/components/layout/spacing";
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
import { TUI_COLOR_PROFILE, theme } from "#tui/theme/theme";
import { truncateToWidth, visibleWidth } from "#tui/utilities/text";

/** Minimum gap (columns) between the left and right rail groups. */
const MIN_PADDING = 2;
/** Background-refresh interval for the HUD cache. */
const HUD_REFRESH_MS = 1000;

/**
 * Status line component: renders the configurable segment rail and appends HUD
 * and hook status details inline when present.
 *
 * Uses the host data provider for repository snapshots, extension statuses,
 * and available provider count. Its only background refresh is the HUD entry
 * cache (1s refresh, error-resilient).
 */
export class StatusLineComponent implements Component {
	#session: StatusLineSessionLike;
	#dataProvider: StatusLineDataProvider;
	#settingsSource: { getStatusLine(): StatusLineSettings };
	#requestRender: (() => void) | null;
	#readHudEntries: StatusLineComponentOptions["readHudEntries"];
	#autoCompactEnabled = true;

	// HUD cache (1s refresh). `[]` until the first successful read.
	#hudEntries: StatusLineHudEntry[] = [];
	#hudLastFetch = 0;
	#hudInFlight = false;
	#refreshGeneration = 0;

	constructor(
		session: StatusLineSessionLike,
		dataProvider: StatusLineDataProvider,
		settingsSource: { getStatusLine(): StatusLineSettings },
		requestRender: () => void,
		options: StatusLineComponentOptions = {},
	) {
		this.#session = session;
		this.#dataProvider = dataProvider;
		this.#settingsSource = settingsSource;
		this.#requestRender = requestRender;
		this.#readHudEntries = options.readHudEntries;
	}

	setSession(session: StatusLineSessionLike): void {
		this.#session = session;
		this.#refreshGeneration += 1;
		this.#hudEntries = [];
		this.#hudLastFetch = 0;
		this.#hudInFlight = false;
		this.#requestRender?.();
	}

	setAutoCompactEnabled(enabled: boolean): void {
		this.#autoCompactEnabled = enabled;
	}

	invalidate(): void {}

	dispose(): void {
		this.#refreshGeneration += 1;
		this.#hudInFlight = false;
		this.#requestRender = null;
	}

	render(width: number): string[] {
		const settings = this.#settingsSource.getStatusLine();

		// Keep HUD, rail, and hook status compacted onto one bottom line.
		this.#refreshHudInBackground();
		const edgeX = Math.min(LAYOUT_EDGE_X, Math.max(0, Math.floor((width - 1) / 2)));
		const contentWidth = Math.max(1, width - edgeX * 2);
		const hud = settings.showHud !== false ? (renderHudBar(this.#hudEntries, contentWidth)?.trimEnd() ?? "") : "";
		const groups = this.#buildStatusLineGroups(contentWidth, settings);
		const leftWidth = visibleWidth(groups.leftGroup);
		const rightWidth = visibleWidth(groups.rightGroup);
		const hasRail = leftWidth > 0 || rightWidth > 0;
		const railWidth = leftWidth > 0 && rightWidth > 0 ? leftWidth + MIN_PADDING + rightWidth : leftWidth + rightWidth;
		const rail = hasRail ? this.#renderRail(groups.leftGroup, groups.rightGroup, railWidth) : "";
		const hook = this.#buildHookLine(contentWidth);
		const separator = theme.fg(TUI_COLOR_PROFILE.statusLine.separator, " │ ");
		const parts = [hud, rail, hook].filter(Boolean);
		const naturalContent = parts.join(separator);

		let content: string;
		if (visibleWidth(naturalContent) <= contentWidth) {
			content = naturalContent;
		} else if (rightWidth > 0) {
			// The right rail is the stable anchor. Shorten the combined prefix
			// before allowing a long HUD/model/path value to hide it.
			const prefix = [hud, groups.leftGroup].filter(Boolean).join(separator);
			if (rightWidth >= contentWidth) {
				content = truncateToWidth(groups.rightGroup, contentWidth, "");
			} else {
				const availablePrefix = Math.max(0, contentWidth - rightWidth - MIN_PADDING);
				const fittedPrefix = prefix ? truncateToWidth(prefix, availablePrefix, "...") : "";
				const prefixWidth = visibleWidth(fittedPrefix);
				const padding = " ".repeat(Math.max(0, contentWidth - prefixWidth - rightWidth));
				content = `${fittedPrefix}${padding}${groups.rightGroup}`;
			}
		} else {
			content = truncateToWidth(naturalContent, contentWidth);
		}

		if (!content) return [];
		const rightPadding = " ".repeat(Math.max(0, width - edgeX - visibleWidth(content)));
		return [`${" ".repeat(edgeX)}${content}${rightPadding}`];
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Background refresh
	// ═══════════════════════════════════════════════════════════════════════════

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
		const generation = this.#refreshGeneration;
		const cwd = this.#session.sessionManager.getCwd();
		const sessionId = this.#session.sessionId ?? "";
		const readHudEntries = this.#readHudEntries;
		void (async () => {
			try {
				const entries = readHudEntries ? await readHudEntries({ cwd, sessionId }) : [];
				if (generation !== this.#refreshGeneration) return;
				this.#hudEntries = [...(entries ?? [])];
			} catch {
				// Keep the last valid HUD snapshot when a provider fails.
			} finally {
				if (generation === this.#refreshGeneration) {
					this.#hudLastFetch = Date.now();
					this.#hudInFlight = false;
					this.#requestRender?.();
				}
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
			availableProviderCount: this.#dataProvider.getAvailableProviderCount(),
			git: {
				branch: this.#dataProvider.getGitBranch(),
				status: this.#dataProvider.getGitStatus(),
			},
			hudPhase: this.#hudEntries[0]?.phase,
		};
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Rail assembly
	// ═══════════════════════════════════════════════════════════════════════════

	#buildStatusLineGroups(width: number, settings: StatusLineSettings): { leftGroup: string; rightGroup: string } {
		const resolved = this.#resolveSettings(settings);
		const ctx = this.#buildSegmentContext(width, resolved.segmentOptions);
		const sepRendered = theme.fg(TUI_COLOR_PROFILE.statusLine.separator, ` ${resolved.separator.left} `);

		const join = (parts: string[]): string => parts.join(sepRendered);
		const rightParts: string[] = [];
		for (const segId of resolved.rightSegments) {
			const rendered = renderSegment(segId, ctx);
			if (rendered.visible && rendered.content) rightParts.push(rendered.content);
		}

		const leftParts: string[] = [];
		for (const segId of resolved.leftSegments) {
			const rendered = renderSegment(segId, ctx);
			if (rendered.visible && rendered.content) leftParts.push(rendered.content);
		}

		return { leftGroup: join(leftParts), rightGroup: join(rightParts) };
	}

	#renderRail(leftGroup: string, rightGroup: string, width: number): string {
		if (width <= 0) return "";
		const leftWidth = visibleWidth(leftGroup);
		const rightWidth = visibleWidth(rightGroup);

		if (rightWidth === 0) return truncateToWidth(leftGroup, width, "...");
		if (rightWidth >= width) return truncateToWidth(rightGroup, width, "");
		if (leftWidth === 0) return `${" ".repeat(width - rightWidth)}${rightGroup}`;

		// The right group is protected; shorten the left group first when the
		// rail is narrower than its natural contents.
		const availableForLeft = width - MIN_PADDING - rightWidth;
		if (availableForLeft <= 0) return `${" ".repeat(width - rightWidth)}${rightGroup}`;

		const fittedLeft = truncateToWidth(leftGroup, availableForLeft, "...");
		const fittedLeftWidth = visibleWidth(fittedLeft);
		const padding = " ".repeat(Math.max(0, width - fittedLeftWidth - rightWidth));
		return `${fittedLeft}${padding}${rightGroup}`;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Hook status line
	// ═══════════════════════════════════════════════════════════════════════════

	#buildHookLine(width: number): string {
		const parts: string[] = [];

		const statuses = this.#dataProvider.getExtensionStatuses();
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
