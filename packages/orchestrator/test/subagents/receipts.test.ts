import { isStructuredReceipt } from "@tsuuanmi/pi-agent";
import { describe, expect, it } from "vitest";
import { attachControlReceipt, createSubagentReceipt } from "#orchestrator/subagents/receipts";
import type { InspectResult, SubagentRecord } from "#orchestrator/subagents/types";

const RECORD: SubagentRecord = {
	id: "subagent-1",
	role: "worker",
	status: "completed",
	resumable: false,
	created_at: "2026-08-04T00:00:00.000Z",
	updated_at: "2026-08-04T00:00:01.000Z",
	cwd: "/tmp/workspace",
};

describe("orchestrator subagent receipts", () => {
	it("projects current-session records into inspectable receipts", () => {
		const record: SubagentRecord = {
			...RECORD,
			status: "running",
			resumable: true,
			parent_session_id: "session-1",
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
				role: "worker",
			},
			outputPreview: "still working",
		});
	});

	it("omits host execution metadata", () => {
		const receipt = createSubagentReceipt({ ...RECORD, status: "failed" }, "session-1");

		expect(receipt.location).not.toHaveProperty("visibility");
		expect(receipt.errorSummary).toBeUndefined();
	});

	it("attaches an agent receipt without a package-specific final field", () => {
		const result = attachControlReceipt({ ok: true, record: RECORD }, "session-1");

		expect(result).toMatchObject({
			ok: true,
			receipt: {
				source: "subagent",
				location: { sessionId: "session-1", subagentId: "subagent-1" },
			},
		});
		expect(result).not.toHaveProperty("final_package");
	});

	it("preserves results without a record unchanged", () => {
		const result: InspectResult = { ok: false, reason: "not_found" };

		expect(attachControlReceipt(result, "session-1")).toBe(result);
	});
});
