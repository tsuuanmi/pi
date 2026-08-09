import type { SubagentManager, SubagentRunRequest } from "@tsuuanmi/pi-agent";
import { describe, expect, it } from "vitest";
import type { WorkflowContext, WorkflowToolHost } from "#workflows/tool/index";
import { registerSubagentTools } from "#workflows/tool/subagent";

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
		const result = (await tool?.execute("call-1", { prompt: "Plan", role: "planner" }, undefined, undefined, ctx)) as
			| { details: { ok: boolean } }
			| undefined;

		expect(result?.details.ok).toBe(true);
		expect(spawnRequests).toHaveLength(1);
		expect(spawnRequests[0]).toMatchObject({
			role: "planner",
			prompt: "Plan",
			parentSessionId: "session-1",
			storageSessionId: "session-1",
		});
	});

	it("rejects execution when the host has no subagent manager", async () => {
		const tool = collectRegisteredTools().get("subagent_spawn");
		const ctx = {
			cwd: "/repo",
			sessionManager: { getSessionId: () => "session-1" },
		} as unknown as WorkflowContext;

		await expect(tool?.execute("call-1", { prompt: "Plan" }, undefined, undefined, ctx)).rejects.toThrow(
			"No subagent manager is available in this session.",
		);
	});
});
