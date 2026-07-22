import type { ExtensionAPI, ExtensionContext, SubagentManager, SubagentRunRequest } from "@tsuuanmi/pi-agent";
import workflowsExtension from "@tsuuanmi/pi-workflows";
import { describe, expect, it } from "vitest";

type RegisteredTool = {
	name: string;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		ctx: ExtensionContext,
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
	} as unknown as ExtensionAPI;
	workflowsExtension(api);
	return tools;
}

function subagentRecord(id: string) {
	return {
		id,
		role: "planner",
		status: "running" as const,
		cwd: "/repo",
		resumable: false,
		created_at: "2026-07-20T14:00:00.000Z",
		updated_at: "2026-07-20T14:00:00.000Z",
	};
}

describe("subagent tools", () => {
	it("passes explicit tmux visibility through subagent_spawn", async () => {
		const spawnRequests: SubagentRunRequest[] = [];
		const subagents = {
			spawn: async (request: SubagentRunRequest) => {
				spawnRequests.push(request);
				return {
					record: {
						id: "subagent-1",
						role: request.role ?? "subagent",
						status: "completed",
						cwd: "/repo",
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
		} as unknown as ExtensionContext;

		const tool = collectRegisteredTools().get("subagent_spawn");
		expect(tool).toBeDefined();
		await tool?.execute("call-1", { prompt: "Plan", role: "planner", visibility: "tmux" }, undefined, undefined, ctx);

		expect(spawnRequests).toHaveLength(1);
		expect(spawnRequests[0]).toMatchObject({
			role: "planner",
			prompt: "Plan",
			parentSessionId: "session-1",
			storageSessionId: "session-1",
			visibility: "tmux",
		});
	});

	it("exposes tmux inspect, attach, and kill live controls", async () => {
		const calls: string[] = [];
		const record = subagentRecord("subagent-1");
		const subagents = {
			inspect: async (id: string, sessionId: string) => {
				calls.push(`inspect:${id}:${sessionId}`);
				return {
					ok: true,
					record,
					artifactPath: "/repo/.pi/session/state/subagents/subagent-1/artifact.json",
					workerMetadataPath: "/repo/.pi/session/state/subagents/subagent-1/worker.json",
					meta: {
						tmux: {
							session_name: "pi-worker-subagent-1",
							target: {
								kind: "pane",
								session_name: "pi-worker-subagent-1",
								session_id: "$1",
								window_id: "@1",
								window_index: 0,
								pane_id: "%1",
								pane_index: 0,
								target: "%1",
							},
						},
					},
				};
			},
			attach: async (id: string, sessionId: string) => {
				calls.push(`attach:${id}:${sessionId}`);
				return {
					ok: true,
					record,
					tmuxTarget: "%1",
					attachCommand: "tmux select-pane -t %1",
				};
			},
			kill: async (id: string, sessionId: string) => {
				calls.push(`kill:${id}:${sessionId}`);
				return { ok: false, reason: "tmux_pane_not_found", record };
			},
		} as unknown as SubagentManager;
		const ctx = {
			cwd: "/repo",
			sessionManager: { getSessionId: () => "session-1" },
			subagents,
		} as unknown as ExtensionContext;
		const tools = collectRegisteredTools();

		const inspected = await tools
			.get("subagent_inspect")
			?.execute("call-inspect", { id: "subagent-1" }, undefined, undefined, ctx);
		const attached = await tools
			.get("subagent_attach")
			?.execute("call-attach", { id: "subagent-1" }, undefined, undefined, ctx);
		const killed = await tools
			.get("subagent_kill")
			?.execute("call-kill", { id: "subagent-1" }, undefined, undefined, ctx);

		expect(calls).toEqual([
			"inspect:subagent-1:session-1",
			"attach:subagent-1:session-1",
			"kill:subagent-1:session-1",
		]);
		expect(inspected).toMatchObject({ details: { artifactPath: expect.stringContaining("artifact.json") } });
		expect(attached).toMatchObject({
			content: [{ text: "Attach subagent-1: tmux select-pane -t %1" }],
			details: { tmuxTarget: "%1" },
		});
		expect(killed).toMatchObject({
			content: [{ text: "Subagent subagent-1 kill failed: tmux_pane_not_found" }],
			details: { reason: "tmux_pane_not_found" },
		});
	});
});
