import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type HighlightTheme,
	highlight,
	renderHighlightedHtml,
	supportsLanguage,
} from "#tui/components/display/syntax-highlight";

describe("supportsLanguage", () => {
	it("returns true for known languages and false for unknown", () => {
		assert.equal(supportsLanguage("typescript"), true);
		assert.equal(supportsLanguage("python"), true);
		assert.equal(supportsLanguage("rust"), true);
		assert.equal(supportsLanguage("not-a-real-lang"), false);
	});
});

describe("renderHighlightedHtml", () => {
	it("passes plain text through when no scope matches", () => {
		assert.equal(renderHighlightedHtml("hello world", {}), "hello world");
	});

	it("applies the matching scope formatter to text inside spans", () => {
		const theme: HighlightTheme = {
			keyword: (t) => `K(${t})`,
			string: (t) => `S(${t})`,
		};
		const html = '<span class="hljs-keyword">if</span> <span class="hljs-string">"x"</span>';
		assert.equal(renderHighlightedHtml(html, theme), 'K(if) S("x")');
	});

	it("falls back to dot-prefix then dash-prefix then default", () => {
		const theme: HighlightTheme = {
			title: (t) => `T(${t})`,
			default: (t) => `D(${t})`,
		};
		// title.function -> no exact, dot-prefix "title" matches.
		assert.equal(renderHighlightedHtml('<span class="hljs-title function_">name</span>', theme), "T(name)");
		// title-function -> no exact, no dot, dash-prefix "title" matches.
		assert.equal(renderHighlightedHtml('<span class="hljs-title-function">name</span>', theme), "T(name)");
		// unknown -> default.
		assert.equal(renderHighlightedHtml('<span class="hljs-unknown">x</span>', theme), "D(x)");
	});

	it("nests scopes and uses the nearest matching ancestor", () => {
		const theme: HighlightTheme = {
			keyword: (t) => `K(${t})`,
			comment: (t) => `C(${t})`,
		};
		const html = '<span class="hljs-keyword"><span class="hljs-comment">nested</span></span>';
		assert.equal(renderHighlightedHtml(html, theme), "C(nested)");
	});
});

describe("highlight", () => {
	it("highlights code with an explicit language using the supplied theme", () => {
		const theme: HighlightTheme = {
			keyword: (t) => `K(${t})`,
		};
		const out = highlight("if (x) {}", { language: "javascript", theme });
		assert.ok(out.includes("K(if)"));
	});

	it("auto-detects when no language is given", () => {
		const theme: HighlightTheme = {
			keyword: (t) => `K(${t})`,
		};
		const out = highlight("def f(): pass", { theme });
		// python `def`/`pass` keywords should be detected and wrapped.
		assert.ok(out.includes("K(def)") || out.includes("K(pass)"));
	});
});
