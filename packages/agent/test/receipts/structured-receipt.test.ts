import {
	assertStructuredReceipt,
	getStructuredReceipt,
	isStructuredReceipt,
	STRUCTURED_RECEIPT_VERSION,
	type StructuredReceipt,
	type SubagentBackendKind,
	type SubagentControlAction,
	type SubagentRecord,
	type SubagentStatus,
	type SubagentVisibility,
	withStructuredReceipt,
} from "@tsuuanmi/pi-agent";
import { describe, expect, test } from "vitest";

const subagentBackendKinds = ["native", "tmux"] as const satisfies readonly SubagentBackendKind[];
const subagentControlActions = ["inspect", "attach", "kill"] as const satisfies readonly SubagentControlAction[];
const subagentStatuses = [
	"queued",
	"running",
	"paused",
	"completed",
	"failed",
	"cancelled",
] as const satisfies readonly SubagentStatus[];
const subagentVisibilities = ["native", "tmux", "auto"] as const satisfies readonly SubagentVisibility[];
const subagentRecordFixture: SubagentRecord = {
	id: "sub-test",
	role: "tester",
	status: "queued",
	cwd: "/tmp",
	resumable: false,
	created_at: "2026-07-20T14:00:00.000Z",
	updated_at: "2026-07-20T14:00:00.000Z",
};

function createReceipt(overrides: Partial<StructuredReceipt> = {}): StructuredReceipt {
	return {
		version: STRUCTURED_RECEIPT_VERSION,
		id: "tool:abc",
		source: "builtin-tool",
		actionSummary: "Command completed",
		status: "completed",
		location: { toolCallId: "abc", cwd: "/tmp" },
		timing: {},
		inspect: [{ label: "command", kind: "command", value: "echo hi" }],
		...overrides,
	};
}

describe("structured receipt", () => {
	test("exports shared subagent contract types", () => {
		expect(subagentBackendKinds).toEqual(["native", "tmux"]);
		expect(subagentControlActions).toEqual(["inspect", "attach", "kill"]);
		expect(subagentStatuses).toEqual(["queued", "running", "paused", "completed", "failed", "cancelled"]);
		expect(subagentVisibilities).toEqual(["native", "tmux", "auto"]);
		expect(subagentRecordFixture).toMatchObject({ id: "sub-test", status: "queued", role: "tester" });
	});

	test("accepts a valid receipt and nested attachment", () => {
		const receipt = createReceipt({
			meta: { tag: "demo" },
			outputPreview: "hello",
		});

		expect(isStructuredReceipt(receipt)).toBe(true);
		assertStructuredReceipt(receipt);
		expect(getStructuredReceipt({ receipt })).toBe(receipt);
		expect(withStructuredReceipt({ note: true }, receipt)).toEqual({ note: true, receipt });
	});

	test("rejects invalid versions, sources, statuses, and malformed shapes", () => {
		expect(isStructuredReceipt({ ...createReceipt(), version: 2 })).toBe(false);
		expect(isStructuredReceipt({ ...createReceipt(), source: "other" })).toBe(false);
		expect(isStructuredReceipt({ ...createReceipt(), status: "waiting" })).toBe(false);
		expect(isStructuredReceipt({ ...createReceipt(), location: null })).toBe(false);
		expect(isStructuredReceipt({ ...createReceipt(), timing: null })).toBe(false);
		expect(isStructuredReceipt({ ...createReceipt(), inspect: [{ label: "bad", kind: "bad", value: "x" }] })).toBe(
			false,
		);
		expect(isStructuredReceipt({ ...createReceipt(), inspect: [{ label: "bad", kind: "command" }] })).toBe(false);
		expect(isStructuredReceipt({ version: 1, id: "x" })).toBe(false);
	});

	test("allows optional timing subfields and preserves unknown meta content", () => {
		const receipt = createReceipt({
			status: "failed",
			errorSummary: "boom",
			timing: { startedAt: "2026-07-20T14:00:00.000Z" },
			meta: { nested: { keep: true } },
		});

		expect(isStructuredReceipt(receipt)).toBe(true);
		expect(receipt.meta).toEqual({ nested: { keep: true } });
	});

	test("accepts paused, queued, cancelled, and failed receipts", () => {
		for (const status of ["paused", "queued", "cancelled", "failed"] as const) {
			expect(
				isStructuredReceipt(
					createReceipt({
						id: `${status}:1`,
						status,
						...(status === "failed" ? { errorSummary: "failed" } : {}),
					}),
				),
			).toBe(true);
		}
	});

	test("keeps source-prefixed ids distinct across sources", () => {
		expect(createReceipt({ id: "tool:1", source: "builtin-tool" }).id).not.toBe(
			createReceipt({ id: "subagent:1", source: "subagent" }).id,
		);
	});
});
