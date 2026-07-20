import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { initTheme } from "#tui/index";
import { type DiffRenderTheme, renderDiff } from "#tui/utilities/diff";

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
function strip(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}

before(() => {
	initTheme("dark");
});

describe("renderDiff", () => {
	it("renders context lines as-is when no theme", () => {
		const out = renderDiff(" 10 hello", { theme: undefined });
		// With no theme, the default theme is used (colored). We only assert the
		// plain text shape here; color assertions are in the theme section below.
		assert.equal(strip(out), " 10 hello");
	});

	it("passes through unparseable lines as context", () => {
		const theme: DiffRenderTheme = {
			context: (t) => `[c]${t}`,
			removed: (t) => `[-]${t}`,
			added: (t) => `[+]${t}`,
			inverse: (t) => `{${t}}`,
		};
		const out = renderDiff("not a diff line", { theme });
		assert.equal(out, "[c]not a diff line");
	});

	it("renders single removed+added pair with intra-line inverse highlighting", () => {
		const theme: DiffRenderTheme = {
			context: (t) => t,
			removed: (t) => `[-]${t}`,
			added: (t) => `[+]${t}`,
			inverse: (t) => `{${t}}`,
		};
		const out = renderDiff("-1 foo bar baz\n+1 foo qux baz", { theme });
		assert.equal(out, "[-]-1 foo {bar} baz\n[+]+1 foo {qux} baz");
	});

	it("renders multi-line removed/added runs without intra-line diffing", () => {
		const theme: DiffRenderTheme = {
			context: (t) => t,
			removed: (t) => `[-]${t}`,
			added: (t) => `[+]${t}`,
			inverse: (t) => `{${t}}`,
		};
		const out = renderDiff("-1 a\n-2 b\n+1 c\n+2 d", { theme });
		assert.equal(out, "[-]-1 a\n[-]-2 b\n[+]+1 c\n[+]+2 d");
	});

	it("renders standalone added lines", () => {
		const theme: DiffRenderTheme = {
			context: (t) => t,
			removed: (t) => `R${t}`,
			added: (t) => `A${t}`,
			inverse: (t) => t,
		};
		const out = renderDiff("+5 brand new", { theme });
		assert.equal(out, "A+5 brand new");
	});

	it("replaces tabs with three spaces before rendering", () => {
		const theme: DiffRenderTheme = {
			context: (t) => t,
			removed: (t) => t,
			added: (t) => t,
			inverse: (t) => t,
		};
		const out = renderDiff("+1 a\tb", { theme });
		assert.equal(out, "+1 a   b");
	});

	it("uses the default theme colors when no theme is supplied", () => {
		const out = renderDiff("-1 old\n+1 new");
		// Default theme wraps removed/added in ANSI escapes from toolDiffRemoved/Added.
		assert.ok(out.includes("\x1b["));
		assert.equal(strip(out), "-1 old\n+1 new");
	});
});
