import { LAYOUT_EDGE_X } from "#tui/components/layout/spacing";
import type { Component } from "#tui/core/tui";
import { theme } from "#tui/theme/theme";

/**
 * Dynamic border component that adjusts to viewport width.
 *
 * Note: When used from extensions loaded via jiti, the global `theme` may be undefined
 * because jiti creates a separate module cache. Always pass an explicit color
 * function when using DynamicBorder in components exported for extension use.
 */
export class DynamicBorder implements Component {
	private color: (str: string) => string;

	constructor(color: (str: string) => string = (str) => theme.fg("border", str)) {
		this.color = color;
	}

	invalidate(): void {
		// No cached state to invalidate currently
	}

	render(width: number): string[] {
		const edgeX = Math.min(LAYOUT_EDGE_X, Math.max(0, Math.floor((width - 1) / 2)));
		const contentWidth = Math.max(1, width - edgeX * 2);
		const rightPadding = " ".repeat(Math.max(0, width - edgeX - contentWidth));
		return [`${" ".repeat(edgeX)}${this.color("─".repeat(contentWidth))}${rightPadding}`];
	}
}
