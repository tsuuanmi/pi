import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { initTheme } from "#tui/index";
import { formatKeyText, keyDisplayText, keyHint, keyText, rawKeyHint } from "#tui/utilities/keybinding-hints";

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
function strip(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}

before(() => {
	initTheme("dark");
});

describe("formatKeyText", () => {
	it("splits chords on + and sequences on /", () => {
		assert.equal(formatKeyText("ctrl+k/enter"), "ctrl+k/enter");
	});

	it("capitalizes the first letter of each part when capitalize is true", () => {
		assert.equal(formatKeyText("ctrl+k/enter", { capitalize: true }), "Ctrl+K/Enter");
	});
});

describe("keyText / keyDisplayText", () => {
	it("resolves a keybinding name to its bound keys via the global manager", () => {
		// tui.input.submit is a known TUI keybinding bound to `enter`.
		const plain = keyText("tui.input.submit");
		assert.equal(plain, "enter");
		assert.equal(strip(plain), plain);
	});

	it("keyDisplayText capitalizes the resolved keys", () => {
		const plain = keyDisplayText("tui.input.submit");
		assert.equal(strip(plain), "Enter");
		assert.ok(/^[A-Z]/.test(strip(plain)), `expected capitalized key, got ${plain}`);
	});
});

describe("keyHint / rawKeyHint", () => {
	it("rawKeyHint renders a dim key followed by a muted description", () => {
		const out = rawKeyHint("ctrl+k", "do thing");
		const plain = strip(out);
		assert.equal(plain, "ctrl+k do thing");
		// Should contain ANSI styling from the active theme.
		assert.ok(out.includes("\x1b["));
	});

	it("keyHint resolves the keybinding and appends the description", () => {
		const out = keyHint("tui.input.submit", "Submit input");
		const plain = strip(out);
		assert.ok(plain.endsWith(" Submit input"));
		assert.ok(out.includes("\x1b["));
	});
});
