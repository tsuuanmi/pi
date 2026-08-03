import { Agent, type AgentEvent, LoopDetector, normalizeLoopDetectionOptions } from "@tsuuanmi/pi-agent";
import { describe, expect, test } from "vitest";
import { assistantToolCall, doneStream, model, repeatTool } from "#agent-test/fixtures";

describe("loop detection", () => {
	test("detects repeated tool-call loops when configured", async () => {
		const events: string[] = [];
		const agent = new Agent({
			initialState: {
				model,
				systemPrompt: "test",
				tools: [repeatTool()],
			},
			streamFn: () => doneStream(assistantToolCall()),
			loopDetection: { maxRepeats: 2, action: "stop" },
		});
		agent.subscribe((event: AgentEvent) => {
			events.push(event.type);
		});

		await agent.prompt("start");

		expect(events.filter((event) => event === "turn_end")).toHaveLength(2);
		expect(events).toContain("loop_detected");
		expect(events.at(-1)).toBe("agent_end");
	});

	test("normalizes loop detection windows and tool-call order", () => {
		const options = normalizeLoopDetectionOptions({ maxRepeats: 3, windowSize: 1 });
		expect(options?.windowSize).toBe(3);
		expect(options).toBeDefined();
		if (!options) throw new Error("Loop detection options were not normalized");
		const detector = new LoopDetector(options);
		const left = assistantToolCall([
			{ type: "toolCall", id: "call-1", name: "first", arguments: { value: "same" } },
			{ type: "toolCall", id: "call-2", name: "second", arguments: { value: "same" } },
		]);
		const right = assistantToolCall([
			{ type: "toolCall", id: "call-2", name: "second", arguments: { value: "same" } },
			{ type: "toolCall", id: "call-1", name: "first", arguments: { value: "same" } },
		]);

		detector.record({ message: left, toolResults: [], newMessages: [] });
		detector.record({ message: right, toolResults: [], newMessages: [] });
		const result = detector.record({ message: left, toolResults: [], newMessages: [] });

		expect(result?.detected).toBe(true);
	});
});
