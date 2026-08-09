import { Agent, type AgentEvent } from "@tsuuanmi/pi-agent";
import type { AssistantMessage, AssistantMessageEvent, AssistantMessageEventStream } from "@tsuuanmi/pi-ai";
import { describe, expect, test } from "vitest";
import { assistantText, doneStream, model } from "#agent-test/fixtures";

describe("agent runtime loop", () => {
	test("uses deterministic runtime timestamps and request ids", async () => {
		const starts: string[] = [];
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			now: () => 123_456,
			createRequestId: (sequence, startedAt) => `request-${sequence}-${startedAt}`,
			providerRequestObserver: {
				onRequestStart: ({ requestId }) => {
					starts.push(requestId);
				},
			},
			streamFn: () => doneStream(assistantText("done")),
		});

		await agent.prompt("start");

		expect(starts).toHaveLength(1);
		expect(starts[0]).toMatch(/^request-\d+-123456$/);
		expect(agent.state.messages[0]?.timestamp).toBe(123_456);
	});

	test("aborts timed out provider requests", async () => {
		const completions: Array<{ error?: unknown; aborted?: boolean; span?: unknown }> = [];
		const traces: AgentEvent[] = [];
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			requestTimeoutMs: 1,
			providerRequestObserver: {
				onRequestComplete: ({ error, aborted, span }) => {
					completions.push({ error, aborted, span });
				},
			},
			streamFn: () =>
				({
					[Symbol.asyncIterator]: () => ({
						next: () => new Promise<IteratorResult<AssistantMessageEvent>>(() => {}),
					}),
					result: () => new Promise<AssistantMessage>(() => {}),
				}) as unknown as AssistantMessageEventStream,
		});
		agent.subscribe((event) => {
			if (event.type === "runtime_trace") {
				traces.push(event);
			}
		});

		await agent.prompt("start");

		expect(completions).toHaveLength(1);
		expect(completions[0]?.aborted).toBe(true);
		expect(completions[0]?.error).toBeInstanceOf(Error);
		expect((completions[0]?.error as Error).message).toBe("Provider request timed out after 1ms");
		expect(completions[0]?.span).toEqual(
			expect.objectContaining({ kind: "request", status: "timeout", name: "request" }),
		);
		expect(agent.state.errorMessage).toBe("Provider request timed out after 1ms");
		expect(traces).toHaveLength(1);
		expect(traces[0]?.type).toBe("runtime_trace");
		if (traces[0]?.type !== "runtime_trace") throw new Error("Request trace was not emitted");
		expect(traces[0].trace.span).toEqual(
			expect.objectContaining({ kind: "request", status: "timeout", name: "request" }),
		);
	});
});
