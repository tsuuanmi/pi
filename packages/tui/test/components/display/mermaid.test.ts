import assert from "node:assert";
import { describe, it } from "node:test";
import { Markdown } from "#tui/components/display/markdown";
import { MermaidRenderError, renderMermaid } from "#tui/components/display/mermaid";
import { visibleWidth } from "#tui/utilities/text";
import { defaultMarkdownTheme } from "#tui-test/support/test-themes";

const sequenceDiagram = `sequenceDiagram
    participant Caller as Pi or Workflow
    participant Manager as Pi SubagentManager
    participant Agent as pi-agent runtime
    participant Backend as Native or Tmux backend
    participant Store as Pi persistence

    Caller->>Manager: spawn(request)
    Manager->>Store: create run record
    Manager->>Manager: resolve profile/model/backend

    alt Native backend
        Manager->>Agent: create and run agent session
        Agent-->>Manager: progress/result
    else Explicit tmux backend
        Manager->>Store: write worker request + identity
        Manager->>Backend: launch tmux worker
        Backend->>Manager: execute worker request
        Manager->>Agent: run agent session
        Agent-->>Manager: progress/result
    end

    Manager->>Store: persist status, receipts, result
    Manager-->>Caller: SubagentRunResult

    Caller->>Manager: inspect / attach / kill
    Manager->>Store: validate identity and control run`;

const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, "");

describe("Mermaid renderer", () => {
	it("renders sequence diagrams within the available width", () => {
		const lines = renderMermaid(sequenceDiagram, 120);

		assert.ok(lines.some((line) => line.includes("┌")));
		assert.ok(lines.some((line) => line.includes("spawn")));
		assert.ok(lines.every((line) => visibleWidth(line) <= 120));
	});

	it("renders Mermaid fences through Markdown without source syntax", () => {
		const markdown = new Markdown(`\`\`\`mermaid\n${sequenceDiagram}\n\`\`\``, 0, 0, defaultMarkdownTheme);
		const lines = markdown.render(120).map((line) => stripAnsi(line).trimEnd());

		assert.ok(lines.some((line) => line.includes("┌")));
		assert.ok(lines.some((line) => line.includes("spawn")));
		assert.ok(lines.every((line) => visibleWidth(line) <= 120));
		assert.ok(!lines.some((line) => line.includes("sequenceDiagram")));
		assert.ok(!lines.some((line) => line.includes("```")));
	});

	it("rejects unsupported diagram declarations instead of rendering source text", () => {
		assert.throws(
			() => renderMermaid("gantt\n    title Project", 120),
			(error: unknown) => error instanceof MermaidRenderError && /Unsupported Mermaid/.test(error.message),
		);
	});

	it("rejects diagrams that cannot fit the available width", () => {
		assert.throws(
			() => renderMermaid(sequenceDiagram, 50),
			(error: unknown) => error instanceof MermaidRenderError && /columns wide/.test(error.message),
		);
	});
});
