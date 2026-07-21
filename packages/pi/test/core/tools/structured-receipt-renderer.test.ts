import { STRUCTURED_RECEIPT_VERSION, type StructuredReceipt } from "@tsuuanmi/pi-agent";
import { describe, expect, test } from "vitest";
import { formatStructuredReceiptLines } from "#pi/modes/interactive/components/structured-receipt-renderer";

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
			"Receipt: Subagent subagent-123 running",
			"Status: running",
			"Where: cwd=/repo",
			"Inspect: session: session-1",
		]);
		expect(formatStructuredReceiptLines(receipt, true)).toContain("Preview: working...");
		expect(formatStructuredReceiptLines(receipt, true)).toContain("Inspect: session file: /tmp/subagent.jsonl");
	});
});
