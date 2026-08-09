import { Agent } from "@tsuuanmi/pi-agent";
import { describe, expect, test } from "vitest";
import { assistantText, doneStream, model, pendingStream, repeatTool } from "#agent-test/fixtures";

describe("agent lifecycle", () => {
	test("runs registered lifecycle hooks in isolated runs", async () => {
		const phases: string[] = [];
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => doneStream(assistantText("done")),
		});
		const hook = {
			name: "lifecycle",
			beforeRun: async () => {
				phases.push("before");
			},
			afterRun: async () => {
				phases.push("after");
			},
		};
		const removeHook = agent.registerHook(hook);
		expect(() => agent.registerHook(hook)).toThrow("already registered");

		const result = await agent.run("start");

		removeHook();
		agent.registerHook(hook);

		expect(result.success).toBe(true);
		expect(phases).toEqual(["before", "after"]);
	});

	test("sets and snapshots active tools", () => {
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => doneStream(assistantText("done")),
		});
		const tool = repeatTool("active");

		const setToolsResult = agent.setTools([tool]);
		expect(setToolsResult).toEqual([tool]);
		setToolsResult.length = 0;
		const tools = agent.getTools();
		expect(tools).toEqual([tool]);
		tools.length = 0;
		expect(agent.getTools()).toEqual([tool]);
	});

	test("dispose is terminal and idempotent", async () => {
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => doneStream(assistantText("done")),
		});

		const first = agent.dispose();
		const second = agent.dispose();

		await expect(first).resolves.toBeUndefined();
		await expect(second).resolves.toBeUndefined();
		expect(() => agent.reset()).toThrow("Agent has been disposed");
		await expect(agent.prompt("start")).rejects.toThrow("Agent has been disposed");
		await expect(agent.run("start")).rejects.toThrow("Agent has been disposed");
		await expect(agent.continue()).rejects.toThrow("Agent has been disposed");
		expect(() => agent.steer(assistantText("queued"))).toThrow("Agent has been disposed");
		expect(() => agent.followUp(assistantText("queued"))).toThrow("Agent has been disposed");
		expect(() => agent.clearAllQueues()).toThrow("Agent has been disposed");
	});

	test("dispose settles active prompt and run work", async () => {
		const promptAgent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => pendingStream(assistantText("done")),
		});

		const promptPromise = promptAgent.prompt("start");
		await Promise.resolve();
		const promptDispose = promptAgent.dispose();
		await expect(promptPromise).resolves.toBeUndefined();
		await expect(promptDispose).resolves.toBeUndefined();
		expect(promptAgent.state.isStreaming).toBe(false);

		const runAgent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => pendingStream(assistantText("done")),
		});

		const runPromise = runAgent.run("start");
		await Promise.resolve();
		await runAgent.dispose();
		await expect(runPromise).resolves.toMatchObject({ success: false });
	});
});
