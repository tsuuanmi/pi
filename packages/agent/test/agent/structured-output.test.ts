import { Agent, type AgentEvent, parseStructuredOutput } from "@tsuuanmi/pi-agent";
import { Type } from "typebox";
import { describe, expect, test } from "vitest";
import { assistantText, doneStream, model } from "#agent-test/fixtures";

describe("structured output", () => {
	test("validates structured JSON against a TypeBox schema", () => {
		const schema = Type.Object({ answer: Type.String(), count: Type.Number() });
		const result = parseStructuredOutput('```json\n{"answer":"ok","count":2}\n```', schema);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual({ answer: "ok", count: 2 });
		}
	});

	test("promptStructured returns validated model output", async () => {
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			stream: () => doneStream(assistantText('{"answer":"ok"}')),
		});
		const events: string[] = [];
		agent.subscribe((event: AgentEvent) => {
			events.push(event.type);
		});

		const result = await agent.promptStructured("answer", { schema: Type.Object({ answer: Type.String() }) });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.answer).toBe("ok");
		}
		expect(events).toContain("structured_output");
	});
});
