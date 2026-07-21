import type { SubagentRecord } from "@tsuuanmi/pi-agent";
import {
	createSubagentListReceipt,
	createSubagentReceipt,
	getStructuredReceipt,
	isStructuredReceipt,
} from "@tsuuanmi/pi-agent";
import { describe, expect, test } from "vitest";
import { workflowReceiptWithStructuredReceipt } from "#workflows/artifacts/artifacts";

describe("subagent structured receipts", () => {
	test("projects current-session subagent records into inspectable receipts", () => {
		const record: SubagentRecord = {
			id: "subagent-1",
			role: "planner",
			status: "running",
			cwd: "/repo",
			resumable: true,
			created_at: "2026-07-20T15:00:00.000Z",
			updated_at: "2026-07-20T15:00:01.000Z",
			started_at: "2026-07-20T15:00:00.000Z",
			session_file: "/sessions/subagent-1.jsonl",
			parent_session_id: "session-1",
			visibility: "tmux",
			result_text: "still working",
		};

		const receipt = createSubagentReceipt(record, "session-1");

		expect(isStructuredReceipt(receipt)).toBe(true);
		expect(receipt).toMatchObject({
			source: "subagent",
			status: "running",
			location: {
				sessionId: "session-1",
				subagentId: "subagent-1",
				cwd: "/repo",
				role: "planner",
				visibility: "tmux",
			},

			outputPreview: "still working",
		});
		expect(receipt.inspect).toContainEqual({
			label: "session file",
			kind: "path",
			value: "/sessions/subagent-1.jsonl",
		});
	});

	test("attaches aggregate list receipts without changing workflow receipt shape", () => {
		const receipt = createSubagentListReceipt("session-1", 2);
		const envelope = workflowReceiptWithStructuredReceipt({ records: [] }, receipt);

		expect(envelope.ok).toBe(true);
		expect(envelope.final_package).toBeDefined();
		expect(getStructuredReceipt(envelope)).toMatchObject({
			source: "subagent",
			status: "completed",
			location: { sessionId: "session-1", records: 2 },
		});
	});
});
