import type { AdapterEvent } from "#runtime/core/protocol/types";
import { buildResponsesJson, responsesSse } from "#runtime/core/responses/bridge";

async function* textEvents(): AsyncGenerator<AdapterEvent> {
	yield { type: "text_delta", text: "Hello" };
	yield { type: "text_delta", text: " world" };
	yield { type: "done", stopReason: "stop", endTurn: true };
}

describe("normalized Responses bridge", () => {
	it("builds one completed text response without fabricated usage", async () => {
		const response = await buildResponsesJson(textEvents(), "fixture/model");
		expect(response).toMatchObject({
			object: "response",
			status: "completed",
			model: "fixture/model",
			output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello world" }] }],
		});
		expect(response.usage).toBeNull();
	});

	it("emits ordered Responses SSE lifecycle events", async () => {
		const body = await new Response(responsesSse(textEvents(), "fixture/model")).text();
		const payloads = body
			.split("\n")
			.filter((line) => line.startsWith("data: {"))
			.map(
				(line) =>
					JSON.parse(line.slice(6)) as {
						type: string;
						sequence_number: number;
						response?: { status: string };
					},
			);
		expect(payloads.map((payload) => payload.type)).toEqual([
			"response.created",
			"response.output_item.added",
			"response.content_part.added",
			"response.output_text.delta",
			"response.output_text.delta",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.completed",
		]);
		expect(payloads.map((payload) => payload.sequence_number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
		expect(payloads[0]?.response?.status).toBe("in_progress");
		expect(payloads.at(-1)?.response?.status).toBe("completed");
		expect(body).toContain("data: [DONE]");
	});
});
