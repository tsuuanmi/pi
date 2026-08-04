import { describe, expect, it } from "vitest";
import { attachControlReceipt } from "#pi/subagents/receipts";
import type { InspectResult, SubagentRecord } from "#pi/subagents/types";

const RECORD: SubagentRecord = {
	id: "subagent-1",
	role: "worker",
	status: "completed",
	resumable: false,
	created_at: "2026-08-04T00:00:00.000Z",
	updated_at: "2026-08-04T00:00:01.000Z",
	cwd: "/tmp/workspace",
};

describe("Pi subagent control receipts", () => {
	it("attaches an agent receipt without a workflow final package", () => {
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
