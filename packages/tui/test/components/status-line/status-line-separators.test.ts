import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSeparator } from "#tui/components/status-line/separators";

describe("getSeparator", () => {
	it("returns slash glyphs for the slash style", () => {
		assert.deepEqual(getSeparator("slash"), { left: "/", right: "/" });
	});

	it("rejects unsupported styles", () => {
		assert.throws(() => getSeparator("pipe" as never), RangeError);
	});
});
