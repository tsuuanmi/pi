import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripAnsi } from "#tui/utilities/ansi";

describe("stripAnsi", () => {
	it("returns the input unchanged when it contains no escape sequences", () => {
		assert.equal(stripAnsi("plain text"), "plain text");
		assert.equal(stripAnsi(""), "");
	});

	it("fast-paths strings without ESC or 8-bit CSI introducer", () => {
		// No \u001B and no \u009B -> identical output.
		assert.equal(stripAnsi("no escapes here"), "no escapes here");
	});

	it("removes CSI color and style sequences", () => {
		assert.equal(stripAnsi("\x1b[31mred\x1b[0m"), "red");
		assert.equal(stripAnsi("\x1b[1;32mbold green\x1b[22;39m"), "bold green");
	});

	it("removes CSI sequences with colon-separated params", () => {
		assert.equal(stripAnsi("\x1b[38:2:255:0:0mtext\x1b[39m"), "text");
	});

	it("removes OSC sequences terminated by BEL", () => {
		assert.equal(stripAnsi("\x1b]0;window title\x07rest"), "rest");
	});

	it("removes OSC sequences terminated by ESC backslash", () => {
		assert.equal(stripAnsi("\x1b]11;rgb:1/1/1\x1b\\rest"), "rest");
	});

	it("throws on non-string input", () => {
		assert.throws(() => stripAnsi(123 as unknown as string), TypeError);
		assert.throws(() => stripAnsi(null as unknown as string), TypeError);
	});
});
