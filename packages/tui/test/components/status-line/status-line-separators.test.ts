import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSeparator } from "#tui/components/status-line/separators";

describe("getSeparator", () => {
	it("returns slash glyphs for the slash style", () => {
		assert.deepEqual(getSeparator("slash"), { left: "/", right: "/" });
	});

	it("falls back to slash for undefined", () => {
		assert.deepEqual(getSeparator(undefined), { left: "/", right: "/" });
	});

	it("falls back to slash for unknown future styles", () => {
		// StatusLineSeparatorStyle is currently only "slash"; treat any other
		// value as a forward-compat fallback to slash.
		assert.deepEqual(getSeparator("pipe" as never), { left: "/", right: "/" });
	});
});
