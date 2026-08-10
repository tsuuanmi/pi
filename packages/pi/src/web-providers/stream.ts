import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	type Message,
	type Model,
	type StreamOptions,
} from "@tsuuanmi/pi-ai";
import type { WebTool, WebTurnEvent } from "@tsuuanmi/pi-web-runtime";
import type { AuthStorage } from "#pi/auth/storage";
import type { WebProviderHost } from "#pi/web-providers/host";
import type { WebTurnRequest } from "./turn.ts";

export type WebToolExecutor = (name: string, input: unknown, signal: AbortSignal) => Promise<unknown>;

type ContentKind = "text" | "thinking";

interface EventState {
	text: string;
	thinking: string;
	order: ContentKind[];
	completed: boolean;
}

export function createWebStream(
	host: WebProviderHost,
	authStorage: AuthStorage,
	provider: string,
	executeTool: WebToolExecutor,
): (model: Model<Api>, context: Context, options?: StreamOptions) => AssistantMessageEventStream {
	return (model, context, options) => {
		const stream = createAssistantMessageEventStream();
		void runStream(stream, host, authStorage, provider, model, context, options, executeTool);
		return stream;
	};
}

async function runStream(
	stream: AssistantMessageEventStream,
	host: WebProviderHost,
	authStorage: AuthStorage,
	provider: string,
	model: Model<Api>,
	context: Context,
	options: StreamOptions | undefined,
	executeTool: WebToolExecutor,
): Promise<void> {
	const signal = options?.signal ?? new AbortController().signal;
	const state: EventState = { text: "", thinking: "", order: [], completed: false };
	stream.push({ type: "start", partial: message(model, state) });
	try {
		if (model.api !== "web") throw new Error(`web stream received non-web model: ${model.api}`);
		if (signal.aborted) throw signal.reason;
		const account = authStorage.getActiveAccount(provider);
		if (!account) throw new Error(`no active browser account for ${provider}`);
		const credential = authStorage.getBrowserAccount(provider, account);
		if (!credential || credential.type !== "browser")
			throw new Error(`active browser account is unavailable: ${account}`);
		const request: WebTurnRequest = {
			provider,
			account,
			credential,
			model: model.id,
			prompt: serializeContext(context),
			attachments: [],
			tools: toWebTools(host, provider, model.id, context),
			executeTool: (name, input) => executeTool(name, input, signal),
			onEvent: (event) => pushEvent(stream, model, state, event),
			signal,
		};
		await host.runTurn(request);
		if (!state.completed) throw new Error("web provider ended without a completion event");
	} catch (error) {
		const reason = signal.aborted ? "aborted" : "error";
		stream.push({
			type: "error",
			reason,
			error: message(model, state, error instanceof Error ? error.message : String(error), reason),
		});
	}
}

async function pushEvent(
	stream: AssistantMessageEventStream,
	model: Model<Api>,
	state: EventState,
	event: WebTurnEvent,
): Promise<void> {
	if (event.type === "text") {
		if (event.text.length === 0) return;
		const first = state.text.length === 0;
		state.text += event.text;
		if (first) state.order.push("text");
		const contentIndex = state.order.indexOf("text");
		const partial = message(model, state);
		if (first) stream.push({ type: "text_start", contentIndex, partial });
		stream.push({ type: "text_delta", contentIndex, delta: event.text, partial });
		return;
	}
	if (event.type === "reasoning") {
		if (event.text.length === 0) return;
		const first = state.thinking.length === 0;
		state.thinking += event.text;
		if (first) state.order.push("thinking");
		const contentIndex = state.order.indexOf("thinking");
		const partial = message(model, state);
		if (first) stream.push({ type: "thinking_start", contentIndex, partial });
		stream.push({ type: "thinking_delta", contentIndex, delta: event.text, partial });
		return;
	}
	if (event.type === "done") {
		for (const [contentIndex, kind] of state.order.entries()) {
			if (kind === "text") {
				stream.push({ type: "text_end", contentIndex, content: state.text, partial: message(model, state) });
			} else {
				stream.push({
					type: "thinking_end",
					contentIndex,
					content: state.thinking,
					partial: message(model, state),
				});
			}
		}
		state.completed = true;
		stream.push({ type: "done", reason: "stop", message: message(model, state) });
		return;
	}
	if (event.type === "tool-result") return;
	throw new Error(`unsupported web event: ${event.type}`);
}

function toWebTools(host: WebProviderHost, provider: string, modelId: string, context: Context): readonly WebTool[] {
	const descriptor = host.get(provider);
	if (!descriptor) throw new Error(`web provider is not registered: ${provider}`);
	const model = descriptor.models.find((candidate) => candidate.id === modelId);
	if (!model) throw new Error(`web model is not registered: ${provider}/${modelId}`);
	if (!model.output.includes("tool")) return [];
	return (context.tools ?? []).map((tool) => ({
		name: tool.name,
		description: tool.description,
		inputSchema: tool.parameters,
	}));
}

function serializeContext(context: Context): string {
	const sections: string[] = [];
	if (context.systemPrompt) sections.push(`[system]\n${context.systemPrompt}`);
	for (const item of context.messages) sections.push(`[${item.role}]\n${serializeMessage(item)}`);
	if (sections.length === 0) throw new Error("web provider context is empty");
	return sections.join("\n\n");
}

function serializeMessage(message: Message): string {
	if (message.role === "user") return serializeText(message.content);
	if (message.role === "toolResult") return `${message.toolName}\n${serializeText(message.content)}`;
	return message.content
		.map((content) => {
			if (content.type === "text") return content.text;
			if (content.type === "thinking") return `[thinking]\n${content.thinking}`;
			return `[tool-call ${content.name}]\n${JSON.stringify(content.arguments)}`;
		})
		.join("\n");
}

function serializeText(content: string | readonly { type: "text"; text: string }[]): string {
	return typeof content === "string" ? content : content.map((item) => item.text).join("\n");
}

function message(
	model: Model<Api>,
	state: EventState,
	errorMessage?: string,
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	const content: AssistantMessage["content"] = [];
	for (const kind of state.order) {
		if (kind === "text" && state.text) content.push({ type: "text", text: state.text });
		if (kind === "thinking" && state.thinking) content.push({ type: "thinking", thinking: state.thinking });
	}
	return {
		role: "assistant",
		content,
		api: "web",
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
		usageProvenance: { type: "provider_unavailable", reason: "browser runtime does not report token usage" },
		stopReason,
		errorMessage,
		timestamp: Date.now(),
	};
}
