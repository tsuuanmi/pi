import {
	createSubagentTools,
	parseThinkingLevel,
	SUBAGENT_SPECS,
	type SubagentManager,
	type SubagentRunRequest,
} from "@tsuuanmi/pi-agent";
import { describe, expect, it } from "vitest";

describe("subagent tools", () => {
	it("keeps shared lifecycle metadata host-neutral", () => {
		const metadata = JSON.stringify(SUBAGENT_SPECS);

		expect(metadata).not.toContain("Pi");
		expect(metadata).not.toContain(".agent/agents");
		expect(metadata).not.toContain(".agents/agents");
	});

	it("passes the complete thinking-level set to the manager", async () => {
		const requests: SubagentRunRequest[] = [];
		const manager = {
			spawn: async (request: SubagentRunRequest) => {
				requests.push(request);
				return {
					record: {
						id: "subagent-1",
						role: "worker",
						status: "completed" as const,
						resumable: false,
						created_at: "2026-07-20T14:00:00.000Z",
						updated_at: "2026-07-20T14:00:00.000Z",
					},
					messages: [],
					output: "done",
				};
			},
		} as unknown as SubagentManager;
		const tool = getTool(createSubagentTools({ manager, sessionId: "session-1" }), "subagent_spawn");
		await tool.execute("call-1", { prompt: "Plan", thinkingLevel: "ultra" });

		expect(requests[0]).toMatchObject({
			prompt: "Plan",
			thinkingLevel: "ultra",
			parentSessionId: "session-1",
			storageSessionId: "session-1",
		});
	});

	it("rejects invalid thinking levels and delivery modes", async () => {
		expect(() => parseThinkingLevel("unsupported")).toThrow("invalid thinkingLevel: unsupported");
		const manager = {
			steer: async () => {
				throw new Error("steer should not run");
			},
		} as unknown as SubagentManager;
		const tool = getTool(createSubagentTools({ manager, sessionId: "session-1" }), "subagent_steer");

		await expect(tool.execute("call-2", { id: "subagent-1", message: "Stop", delivery: "invalid" })).rejects.toThrow(
			"invalid subagent delivery: invalid",
		);
	});
});

function getTool<ToolType extends { name: string }>(tools: readonly ToolType[], name: string): ToolType {
	const tool = tools.find((candidate) => candidate.name === name);
	if (!tool) throw new Error(`Missing tool: ${name}`);
	return tool;
}
