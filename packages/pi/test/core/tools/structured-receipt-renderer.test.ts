import { STRUCTURED_RECEIPT_VERSION, type StructuredReceipt } from "@tsuuanmi/pi-agent";
import { initTheme, stripAnsi, theme } from "@tsuuanmi/pi-tui";
import { describe, expect, test, beforeAll } from "vitest";
import { formatStructuredReceiptLines, renderStructuredReceipt } from "@tsuuanmi/pi-tui";

beforeAll(() => {
	initTheme("dark");
});

describe("structured receipt renderer", () => {
	test("renders compact and expanded receipt inspection details", () => {
		const receipt: StructuredReceipt = {
			version: STRUCTURED_RECEIPT_VERSION,
			id: "subagent:123",
			source: "subagent",
			actionSummary: "Subagent subagent-123 running",
			status: "running",
			location: { sessionId: "session-1", subagentId: "subagent-123", cwd: "/repo" },
			timing: { startedAt: "2026-07-20T15:00:00.000Z", durationMs: 42 },
			inspect: [
				{ label: "session", kind: "session", value: "session-1" },
				{ label: "session file", kind: "path", value: "/tmp/subagent.jsonl" },
			],
			outputPreview: "working...",
		};

		expect(formatStructuredReceiptLines(receipt, false)).toEqual([
			"Receipt: Subagent subagent-123 running • Status: running • Where: cwd=/repo",
			"Inspect: session: session-1",
		]);
		expect(formatStructuredReceiptLines(receipt, true)).toContain("Preview: working...");
		expect(formatStructuredReceiptLines(receipt, true)).toContain("Inspect: session file: /tmp/subagent.jsonl");
	});

	test("hides redundant builtin bash details and colors receipt status", () => {
		const receipt: StructuredReceipt = {
			version: STRUCTURED_RECEIPT_VERSION,
			id: "tool-1",
			source: "builtin-tool",
			actionSummary: "Executed bash command",
			status: "completed",
			location: { cwd: "/repo", toolCallId: "tool-1", toolName: "bash", command: "git status" },
			timing: {},
			inspect: [{ label: "command", kind: "command", value: "git status" }],
		};

		const rendered = renderStructuredReceipt(receipt, false, theme).render(120).join("\n");
		expect(stripAnsi(rendered).trimEnd()).toBe("Receipt: Executed bash command • Status: completed");
		expect(rendered).toContain("\u001b[");
		expect(stripAnsi(rendered)).not.toContain("Where: cwd=/repo");
		expect(stripAnsi(rendered)).not.toContain("Inspect: command: git status");
	});
});
