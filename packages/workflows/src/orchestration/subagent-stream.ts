import type { StreamFunction } from "@tsuuanmi/pi-agent";
import { type AssistantMessage, AssistantMessageEventStream, type Context, type Model } from "@tsuuanmi/pi-ai";

interface SubagentStreamInput {
	model: Model;
	context: Context;
	signal?: AbortSignal;
}

type RunSubagent = (input: SubagentStreamInput) => Promise<string>;

export function createSubagentStream(run: RunSubagent): StreamFunction {
	return async (model, context, options) => {
		const stream = new AssistantMessageEventStream();
		try {
			const output = await run({ model, context, signal: options?.signal });
			const message = createMessage(model, output);
			stream.push({ type: "start", partial: message });
			if (output.length > 0) {
				stream.push({ type: "text_start", contentIndex: 0, partial: message });
				stream.push({ type: "text_delta", contentIndex: 0, delta: output, partial: message });
				stream.push({ type: "text_end", contentIndex: 0, content: output, partial: message });
			}
			stream.push({ type: "done", reason: "stop", message });
		} catch (error) {
			const aborted = options?.signal?.aborted === true;
			const message = createErrorMessage(model, error, aborted);
			stream.push({ type: "start", partial: message });
			stream.push({ type: "error", reason: aborted ? "aborted" : "error", error: message });
		}
		return stream;
	};
}

function createMessage(model: Model, output: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: output }],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function createErrorMessage(model: Model, error: unknown, aborted: boolean): AssistantMessage {
	return {
		...createMessage(model, ""),
		stopReason: aborted ? "aborted" : "error",
		errorMessage: error instanceof Error ? error.message : String(error),
	};
}
