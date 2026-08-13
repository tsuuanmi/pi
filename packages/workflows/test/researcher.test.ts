import { describe, expect, it, vi } from "vitest";
import type { WorkflowContext } from "#workflows/tool/context";
import type { WorkflowToolHost } from "#workflows/tool/host";
import { registerResearcherTool } from "#workflows/tool/researcher";

function tools(): Map<string, any> {
	const captured = new Map<string, any>();
	registerResearcherTool({
		registerTool(value) {
			captured.set(value.name, value);
		},
	} as WorkflowToolHost);
	return captured;
}

function context(provider = "chatgpt-web") {
	const record = {
		id: "research-1",
		status: "completed",
		protected_policy_id: "pi-workflows/researcher-v1",
		agent_profile: "researcher",
		model: "chatgpt-web/chatgpt-web/high",
	};
	const spawn = vi.fn(async (request) => ({ record, output: "findings", request }));
	const resume = vi.fn(async () => ({ ok: true, result: { record, output: "continued" } }));
	const steer = vi.fn(async () => ({ ok: true, result: { record, output: "steered" } }));
	const read = vi.fn(async () => record);
	return {
		spawn,
		resume,
		steer,
		read,
		context: {
			cwd: "/workspace",
			sessionManager: { getSessionId: () => "parent-session" },
			subagent: { spawn, resume, steer, read } as any,
			resolveModel: (requestedProvider, modelId) =>
				requestedProvider === provider && modelId === "chatgpt-web/high"
					? ({ provider, id: modelId } as any)
					: undefined,
		} satisfies WorkflowContext,
	};
}

describe("protected researcher tools", () => {
	it("spawns the persistent researcher with an exact registered ChatGPT Web model", async () => {
		const target = context();
		const result = await tools()
			.get("researcher_spawn")
			.execute(
				"call",
				{ task: "Research current browser APIs", model: "chatgpt-web/chatgpt-web/high" },
				undefined,
				undefined,
				target.context,
			);
		expect(result.content[0].text).toBe("findings");
		expect(target.spawn).toHaveBeenCalledWith(
			expect.objectContaining({
				agent: "researcher",
				role: "researcher",
				model: "chatgpt-web/chatgpt-web/high",
				tools: [],
				persistent: true,
				storageSessionId: "parent-session",
			}),
		);
	});

	it("resumes and steers only a persisted protected researcher", async () => {
		const target = context();
		await tools()
			.get("researcher_resume")
			.execute("resume", { id: "research-1", message: "continue" }, undefined, undefined, target.context);
		expect(target.resume).toHaveBeenCalledWith(
			"research-1",
			"continue",
			expect.objectContaining({ model: "chatgpt-web/chatgpt-web/high", tools: [] }),
		);

		await tools()
			.get("researcher_steer")
			.execute(
				"steer",
				{ id: "research-1", message: "focus on primary sources" },
				undefined,
				undefined,
				target.context,
			);
		expect(target.steer).toHaveBeenCalledWith("research-1", "focus on primary sources", "steer", "parent-session");
	});

	it("rejects missing or non-native research models before manager execution", async () => {
		const missing = context();
		await expect(
			tools()
				.get("researcher_spawn")
				.execute("call", { task: "Research", model: "chatgpt-web/missing" }, undefined, undefined, missing.context),
		).rejects.toThrow("Research capability is unavailable");
		expect(missing.spawn).not.toHaveBeenCalled();

		const local = context("openai-codex");
		await expect(
			tools()
				.get("researcher_spawn")
				.execute(
					"call",
					{ task: "Research", model: "openai-codex/chatgpt-web/high" },
					undefined,
					undefined,
					local.context,
				),
		).rejects.toThrow("Research capability is unavailable");
		expect(local.spawn).not.toHaveBeenCalled();
	});
});
