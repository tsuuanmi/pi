import type { SeparatorDef, StatusLineSeparatorStyle } from "#tui/components/status-line/types";

/** Resolve a validated separator style to its glyph definition. */
export function getSeparator(style: StatusLineSeparatorStyle): SeparatorDef {
	if (style !== "slash") {
		throw new RangeError(`Unsupported status-line separator: ${style}`);
	}
	return { left: "/", right: "/" };
}
