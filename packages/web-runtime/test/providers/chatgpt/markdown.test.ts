import { describe, expect, test } from "vitest";
import { MarkdownBuffer, type MarkdownSegment, toMarkdown } from "../../../src/providers/chatgpt/markdown.ts";

const segment = (overrides: Partial<MarkdownSegment> = {}): MarkdownSegment => ({
	key: "0:p",
	html: "<p>Hello <strong>world</strong>.</p>",
	text: "Hello world.",
	streamable: true,
	...overrides,
});

describe("ChatGPT Markdown", () => {
	test("serializes GFM without browser controls or images", () => {
		expect(
			toMarkdown(
				'<h2>Result</h2><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><button>Copy</button><img src="x">',
			),
		).toBe("## Result\n\n| A | B |\n| --- | --- |\n| 1 | 2 |");
	});

	test("commits only stable append-only blocks", () => {
		const buffer = new MarkdownBuffer((value) => value, 100);
		expect(buffer.observe([segment()], 0)).toBe("");
		expect(buffer.observe([segment()], 99)).toBe("");
		expect(buffer.observe([segment()], 100)).toBe("Hello **world**.");
		expect(
			buffer.observe(
				[segment(), segment({ key: "1:p", html: "<p>Second.</p>", text: "Second.", streamable: false })],
				200,
			),
		).toBe("");
		expect(buffer.finish()).toEqual({ markdown: "Hello **world**.\n\nSecond.", delta: "\n\nSecond." });
	});

	test("rejects mutations to committed blocks", () => {
		const buffer = new MarkdownBuffer((value) => value, 0);
		expect(buffer.observe([segment()], 0)).toBe("Hello **world**.");
		expect(() => buffer.observe([segment({ text: "Changed." })], 1)).toThrow(/changed a completed text block/);
	});
});
