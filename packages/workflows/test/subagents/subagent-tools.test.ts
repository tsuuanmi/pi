import type { SubagentManager, SubagentRunRequest } from "@tsuuanmi/pi-agent";
import { describe, expect, it } from "vitest";
import { registerSubagentTools } from "#workflows/subagents/subagent-tools";
import type { WorkflowContext, WorkflowToolHost } from "#workflows/tools/workflow-tools";

type RegisteredTool = {
	name: string;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		ctx: WorkflowContext,
	) => Promise<unknown>;
};

function collectRegisteredTools(): Map<string, RegisteredTool> {
	const tools = new Map<string, RegisteredTool>();
	const api = {
		registerTool(tool: RegisteredTool): void {
			tools.set(tool.name, tool);
		},
		registerCommand(): void {},
		on(): void {},
		sendUserMessage(): void {},
	} as unknown as WorkflowToolHost;
	registerSubagentTools(api);
	return tools;
}

describe("subagent tools", () => {
	it("passes core run fields through subagent_spawn", async () => {
		const spawnRequests: SubagentRunRequest[] = [];
		const subagents = {
			spawn: async (request: SubagentRunRequest) => {
				spawnRequests.push(request);
				return {
					record: {
						id: "subagent-1",
						role: request.role ?? "subagent",
						status: "completed",
						resumable: false,
						created_at: "2026-07-20T14:00:00.000Z",
						updated_at: "2026-07-20T14:00:00.000Z",
					},
					messages: [],
					output: "done",
				};
			},
		} as unknown as SubagentManager;
		const ctx = {
			cwd: "/repo",
			sessionManager: { getSessionId: () => "session-1" },
			subagents,
		} as unknown as WorkflowContext;

		const tool = collectRegisteredTools().get("subagent_spawn");
		expect(tool).toBeDefined();
		await tool?.execute("call-1", { prompt: "Plan", role: "planner" }, undefined, undefined, ctx);

		expect(spawnRequests).toHaveLength(1);
		expect(spawnRequests[0]).toMatchObject({
			role: "planner",
			prompt: "Plan",
			parentSessionId: "session-1",
			storageSessionId: "session-1",
		});
	});
});
