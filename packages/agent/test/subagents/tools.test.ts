import {
	parseThinkingLevel,
	type SubagentManager,
	type SubagentRunRequest,
	subagentSpawnTool,
	subagentSteerTool,
} from "@tsuuanmi/pi-agent";
import { describe, expect, it } from "vitest";

describe("subagent tools", () => {
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
		await subagentSpawnTool.execute(
			"call-1",
			{ prompt: "Plan", thinkingLevel: "ultra" },
			{ manager, sessionId: "session-1" },
		);

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

		await expect(
			subagentSteerTool.execute(
				"call-2",
				{ id: "subagent-1", message: "Stop", delivery: "invalid" },
				{ manager, sessionId: "session-1" },
			),
		).rejects.toThrow("invalid subagent delivery: invalid");
	});
});
