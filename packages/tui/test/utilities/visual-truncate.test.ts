import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { truncateToVisualLines } from "#tui/utilities/visual-truncate";

describe("truncateToVisualLines", () => {
	it("returns empty for empty text", () => {
		assert.deepEqual(truncateToVisualLines("", 5, 80), { visualLines: [], skippedCount: 0 });
	});

	it("returns all lines when the text fits within maxVisualLines", () => {
		const text = "line1\nline2\nline3";
		const out = truncateToVisualLines(text, 5, 80);
		assert.equal(out.skippedCount, 0);
		assert.equal(out.visualLines.length, 3);
		// Text.render pads each visual line to the render width.
		assert.equal(out.visualLines[0].trimEnd(), "line1");
		assert.equal(out.visualLines[2].trimEnd(), "line3");
	});

	it("keeps the last maxVisualLines lines and reports the skipped count", () => {
		const text = "a\nb\nc\nd\ne";
		const out = truncateToVisualLines(text, 2, 80);
		assert.equal(out.skippedCount, 3);
		assert.equal(out.visualLines.length, 2);
		assert.equal(out.visualLines[0].trimEnd(), "d");
		assert.equal(out.visualLines[1].trimEnd(), "e");
	});

	it("wraps long lines based on width and counts visual lines", () => {
		const text = "word ".repeat(40).trim(); // one long logical line
		const out = truncateToVisualLines(text, 1, 20);
		assert.equal(out.visualLines.length, 1);
		assert.ok(out.skippedCount >= 1, `expected skippedCount >= 1, got ${out.skippedCount}`);
	});
});
