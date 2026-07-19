import type { SeparatorDef, StatusLineSeparatorStyle } from "#pi/modes/interactive/components/status-line/types";

/**
 * Resolve a separator style to its glyph definition.
 *
 * Only `slash` is rendered today. Any other value (including future/unknown
 * styles) falls back to slash, so adding a new style is a non-breaking change.
 * Pi's theme has no `sep.*` tokens (gajae does), so the slash glyph is
 * hardcoded here.
 */
export function getSeparator(style: StatusLineSeparatorStyle | undefined): SeparatorDef {
	switch (style) {
		case "slash":
			return { left: "/", right: "/" };
		default:
			// Unknown/future styles fall back to slash.
			return { left: "/", right: "/" };
	}
}
