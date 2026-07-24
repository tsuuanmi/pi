import type {
	Api,
	AssistantMessage,
	Context,
	Message,
	Model,
	StreamOptions,
	TextContent,
	ThinkingContent,
	ToolCall,
	ToolResultMessage,
	Usage,
} from "#ai/types";

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmTextPart {
	type: "text";
	text: string;
	textSignature?: string;
}

export interface LlmThinkingPart {
	type: "thinking";
	thinking: string;
	thinkingSignature?: string;
	redacted?: boolean;
}

export interface LlmToolCallPart {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export interface LlmToolResultPart {
	type: "toolResult";
	toolCallId: string;
	toolName: string;
	content: string;
	isError?: boolean;
}

export type LlmContentPart = LlmTextPart | LlmThinkingPart | LlmToolCallPart | LlmToolResultPart;

export interface LlmMessage {
	role: LlmRole;
	content: string | readonly LlmContentPart[];
}

export interface LlmToolDefinition {
	name: string;
	description?: string;
	parameters?: unknown;
}

export interface LlmUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	totalTokens: number;
	cost?: Usage["cost"];
}

export type LlmStopReason = "stop" | "length" | "tool_use" | "error" | "aborted" | string;

export interface LlmResponse {
	content: string;
	parts: readonly LlmContentPart[];
	toolCalls?: readonly LlmToolCallPart[];
	usage?: LlmUsage;
	stopReason?: LlmStopReason;
	structured?: unknown;
	raw?: unknown;
}

export interface LlmCompleteOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	signal?: AbortSignal;
	tools?: readonly LlmToolDefinition[];
	metadata?: Record<string, unknown>;
}

export interface LlmStreamOptions extends LlmCompleteOptions {}

export type LlmStreamEvent =
	| { type: "text_delta"; delta: string }
	| { type: "tool_call"; toolCall: LlmToolCallPart }
	| { type: "done"; response: LlmResponse }
	| { type: "error"; error: unknown };

export interface LlmAdapter {
	complete(messages: readonly LlmMessage[], options?: LlmCompleteOptions): Promise<LlmResponse>;
}

export type LLMAdapter = LlmAdapter;
export type LLMChatOptions = LlmCompleteOptions;
export type LLMStreamOptions = LlmStreamOptions;
export type LLMMessage = LlmMessage;
export type LLMContentBlock = LlmContentPart;
export type LLMToolDef = LlmToolDefinition;
export type TokenUsage = LlmUsage;
export type LLMResponse = LlmResponse;
export type LLMStreamEvent = LlmStreamEvent;

export interface PiProviderAdapterOptions extends LlmCompleteOptions {
	providerOptions?: StreamOptions;
}

function textFromParts(parts: readonly LlmContentPart[]): string {
	return parts
		.filter((part): part is LlmTextPart => part.type === "text")
		.map((part) => part.text)
		.join("");
}

function partsFromAssistant(message: AssistantMessage): LlmContentPart[] {
	return message.content.map((part) => {
		if (part.type === "text") return { type: "text", text: part.text, textSignature: part.textSignature };
		if (part.type === "thinking") {
			return {
				type: "thinking",
				thinking: part.thinking,
				thinkingSignature: part.thinkingSignature,
				redacted: part.redacted,
			};
		}
		return { type: "toolCall", id: part.id, name: part.name, arguments: part.arguments };
	});
}

function usageFromAssistant(usage: Usage | undefined): LlmUsage | undefined {
	if (!usage) return undefined;
	return {
		inputTokens: usage.input,
		outputTokens: usage.output,
		cacheReadTokens: usage.cacheRead,
		cacheWriteTokens: usage.cacheWrite,
		totalTokens: usage.totalTokens,
		cost: usage.cost,
	};
}

function stopReasonFromAssistant(stopReason: AssistantMessage["stopReason"]): LlmStopReason {
	return stopReason === "toolUse" ? "tool_use" : stopReason;
}

function textContentFromString(text: string): TextContent[] {
	return [{ type: "text", text }];
}

function toTextContent(parts: readonly LlmContentPart[]): TextContent[] {
	return parts.flatMap((part) => {
		if (part.type === "text") return [{ type: "text", text: part.text, textSignature: part.textSignature }];
		if (part.type === "toolResult") return textContentFromString(part.content);
		return textContentFromString(JSON.stringify(part));
	});
}

function toAssistantParts(parts: readonly LlmContentPart[]): (TextContent | ThinkingContent | ToolCall)[] {
	return parts.map((part) => {
		if (part.type === "text") return { type: "text", text: part.text, textSignature: part.textSignature };
		if (part.type === "thinking") return part;
		if (part.type === "toolCall") return part;
		return { type: "text", text: part.content };
	});
}

function toPiMessage(message: LlmMessage, model: Model<Api>, timestamp: number): Message | undefined {
	if (message.role === "system") return undefined;
	if (message.role === "user") {
		return {
			role: "user",
			content: typeof message.content === "string" ? message.content : toTextContent(message.content),
			timestamp,
		};
	}
	if (message.role === "tool") {
		const resultPart =
			typeof message.content === "string"
				? undefined
				: message.content.find((part): part is LlmToolResultPart => part.type === "toolResult");
		return {
			role: "toolResult",
			toolCallId: resultPart?.toolCallId ?? "tool-result",
			toolName: resultPart?.toolName ?? "tool",
			content: textContentFromString(
				typeof message.content === "string" ? message.content : (resultPart?.content ?? ""),
			),
			isError: resultPart?.isError ?? false,
			timestamp,
		} satisfies ToolResultMessage;
	}
	const content =
		typeof message.content === "string" ? textContentFromString(message.content) : toAssistantParts(message.content);
	return {
		role: "assistant",
		content,
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
		timestamp,
	};
}

export interface PiProviderAdapterConfig {
	model: Model<Api>;
	completeSimple: (model: Model<Api>, context: Context, options?: StreamOptions) => Promise<AssistantMessage>;
}

export class PiProviderAdapter implements LlmAdapter {
	readonly model: Model<Api>;
	private readonly completeSimple: PiProviderAdapterConfig["completeSimple"];

	constructor(config: PiProviderAdapterConfig) {
		this.model = config.model;
		this.completeSimple = config.completeSimple;
	}

	async complete(messages: readonly LlmMessage[], options: PiProviderAdapterOptions = {}): Promise<LlmResponse> {
		const model = { ...this.model, ...(options.model ? { id: options.model } : {}) };
		const timestamp = Date.now();
		const systemPrompt = messages.find((message) => message.role === "system")?.content;
		const context: Context = {
			...(typeof systemPrompt === "string" ? { systemPrompt } : {}),
			messages: messages
				.map((message) => toPiMessage(message, model, timestamp))
				.filter((message): message is Message => message !== undefined),
			tools: options.tools?.map((tool) => ({
				name: tool.name,
				description: tool.description ?? "",
				parameters: tool.parameters as never,
			})),
		};
		const response = await this.completeSimple(model, context, {
			...options.providerOptions,
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			signal: options.signal,
		});
		const parts = partsFromAssistant(response);
		const toolCalls = parts.filter((part): part is LlmToolCallPart => part.type === "toolCall");
		return {
			content: textFromParts(parts),
			parts,
			toolCalls,
			usage: usageFromAssistant(response.usage),
			stopReason: stopReasonFromAssistant(response.stopReason),
			raw: response,
		};
	}
}
