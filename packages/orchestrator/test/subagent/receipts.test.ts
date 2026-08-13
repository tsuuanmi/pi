import { isStructuredReceipt } from "@tsuuanmi/pi-agent";
import { describe, expect, it } from "vitest";
import { attachInspectionReceipt, createSubagentReceipt } from "#orchestrator/subagent/receipts";
import type { InspectResult, SubagentRecord } from "#orchestrator/subagent/types";

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
			max_duration_ms: 120_000,
			result_text: "still working",
			artifact_file: "/tmp/runtime.json",
			output_artifact: {
				path: "/tmp/report.md",
				sha256: "output-sha",
				media_type: "text/markdown",
				mode: "create",
			},
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
			meta: {
				max_duration_ms: 120_000,
				output_artifact_sha256: "output-sha",
				output_artifact_media_type: "text/markdown",
			},
		});
		expect(receipt.inspect).toContainEqual({ label: "runtime artifact", kind: "path", value: "/tmp/runtime.json" });
		expect(receipt.inspect).toContainEqual({ label: "output artifact", kind: "path", value: "/tmp/report.md" });
	});

	it("identifies in-memory runs without implying a missing durable session", () => {
		const receipt = createSubagentReceipt({ ...RECORD, status: "failed" }, "session-1");

		expect(receipt.location).not.toHaveProperty("visibility");
		expect(receipt.errorSummary).toBeUndefined();
		expect(receipt.meta).toMatchObject({ session_storage: "in-memory" });
	});

	it("attaches an agent receipt without a package-specific final field", () => {
		const result = attachInspectionReceipt({ ok: true, record: RECORD }, "session-1");

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

		expect(attachInspectionReceipt(result, "session-1")).toBe(result);
	});
});
