import assert from "node:assert";
import { describe, it } from "node:test";
import { CollapsibleMessage } from "#tui/components/messages/collapsible-message";
import { getMarkdownTheme, initTheme } from "#tui/theme/theme";

function createMessage(): CollapsibleMessage {
	return new CollapsibleMessage({
		label: "[summary]",
		collapsedText: "Collapsed (press expand)",
		expandedHeaderMarkdown: "**Summary**\n\n",
		expandedBodyMarkdown: "Hello world",
		markdownTheme: getMarkdownTheme(),
	});
}

describe("CollapsibleMessage", () => {
	it("renders collapsed and expanded content", () => {
		initTheme("dark");
		const message = createMessage();
		let lines = message.render(60);
		assert.ok(lines.some((line) => line.includes("[summary]")));
		assert.ok(lines.some((line) => line.includes("Collapsed")));

		message.setExpanded(true);
		lines = message.render(60);
		assert.ok(lines.some((line) => line.includes("Summary")));
		assert.ok(lines.some((line) => line.includes("Hello world")));
	});
});
