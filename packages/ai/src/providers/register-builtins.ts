import { clearApiProviders, registerApiProvider } from "#ai/core/api-registry";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEvent,
	Context,
	Model,
	SimpleStreamOptions,
	StreamFunction,
	StreamOptions,
} from "#ai/core/types";
import type { AnthropicOptions } from "#ai/providers/anthropic/index";
import type { OpenAICodexResponsesOptions } from "#ai/providers/openai/codex-responses";
import type { OpenAICompletionsOptions } from "#ai/providers/openai/completions";
import type { OpenAIResponsesOptions } from "#ai/providers/openai/responses";
import { AssistantMessageEventStream } from "#ai/transport/event-stream";

interface LazyProviderModule<
	TApi extends Api,
	TOptions extends StreamOptions,
	TSimpleOptions extends SimpleStreamOptions,
> {
	stream: (model: Model<TApi>, context: Context, options?: TOptions) => AsyncIterable<AssistantMessageEvent>;
	streamSimple: (
		model: Model<TApi>,
		context: Context,
		options?: TSimpleOptions,
	) => AsyncIterable<AssistantMessageEvent>;
}

interface AnthropicProviderModule {
	streamAnthropic: StreamFunction<"anthropic-messages", AnthropicOptions>;
	streamSimpleAnthropic: StreamFunction<"anthropic-messages", SimpleStreamOptions>;
}

interface OpenAICodexResponsesProviderModule {
	streamOpenAICodexResponses: StreamFunction<"openai-codex-responses", OpenAICodexResponsesOptions>;
	streamSimpleOpenAICodexResponses: StreamFunction<"openai-codex-responses", SimpleStreamOptions>;
}

interface OpenAICompletionsProviderModule {
	streamOpenAICompletions: StreamFunction<"openai-completions", OpenAICompletionsOptions>;
	streamSimpleOpenAICompletions: StreamFunction<"openai-completions", SimpleStreamOptions>;
}

interface OpenAIResponsesProviderModule {
	streamOpenAIResponses: StreamFunction<"openai-responses", OpenAIResponsesOptions>;
	streamSimpleOpenAIResponses: StreamFunction<"openai-responses", SimpleStreamOptions>;
}

let anthropicProviderModulePromise:
	| Promise<LazyProviderModule<"anthropic-messages", AnthropicOptions, SimpleStreamOptions>>
	| undefined;
let openAICodexResponsesProviderModulePromise:
	| Promise<LazyProviderModule<"openai-codex-responses", OpenAICodexResponsesOptions, SimpleStreamOptions>>
	| undefined;
let openAICompletionsProviderModulePromise:
	| Promise<LazyProviderModule<"openai-completions", OpenAICompletionsOptions, SimpleStreamOptions>>
	| undefined;
let openAIResponsesProviderModulePromise:
	| Promise<LazyProviderModule<"openai-responses", OpenAIResponsesOptions, SimpleStreamOptions>>
	| undefined;

function forwardStream(target: AssistantMessageEventStream, source: AsyncIterable<AssistantMessageEvent>): void {
	(async () => {
		for await (const event of source) {
			target.push(event);
		}
		target.end();
	})();
}

function createLazyLoadErrorMessage<TApi extends Api>(model: Model<TApi>, error: unknown): AssistantMessage {
	return {
		role: "assistant",
		content: [],
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
		stopReason: "error",
		errorMessage: error instanceof Error ? error.message : String(error),
		timestamp: Date.now(),
	};
}

function createLazyStream<TApi extends Api, TOptions extends StreamOptions, TSimpleOptions extends SimpleStreamOptions>(
	loadModule: () => Promise<LazyProviderModule<TApi, TOptions, TSimpleOptions>>,
): StreamFunction<TApi, TOptions> {
	return (model, context, options) => {
		const outer = new AssistantMessageEventStream();

		loadModule()
			.then((module) => {
				const inner = module.stream(model, context, options);
				forwardStream(outer, inner);
			})
			.catch((error) => {
				const message = createLazyLoadErrorMessage(model, error);
				outer.push({ type: "error", reason: "error", error: message });
				outer.end(message);
			});

		return outer;
	};
}

function createLazySimpleStream<
	TApi extends Api,
	TOptions extends StreamOptions,
	TSimpleOptions extends SimpleStreamOptions,
>(loadModule: () => Promise<LazyProviderModule<TApi, TOptions, TSimpleOptions>>): StreamFunction<TApi, TSimpleOptions> {
	return (model, context, options) => {
		const outer = new AssistantMessageEventStream();

		loadModule()
			.then((module) => {
				const inner = module.streamSimple(model, context, options);
				forwardStream(outer, inner);
			})
			.catch((error) => {
				const message = createLazyLoadErrorMessage(model, error);
				outer.push({ type: "error", reason: "error", error: message });
				outer.end(message);
			});

		return outer;
	};
}

function loadAnthropicProviderModule(): Promise<
	LazyProviderModule<"anthropic-messages", AnthropicOptions, SimpleStreamOptions>
> {
	anthropicProviderModulePromise ||= import("#ai/providers/anthropic/index").then((module) => {
		const provider = module as AnthropicProviderModule;
		return {
			stream: provider.streamAnthropic,
			streamSimple: provider.streamSimpleAnthropic,
		};
	});
	return anthropicProviderModulePromise;
}

function loadOpenAICodexResponsesProviderModule(): Promise<
	LazyProviderModule<"openai-codex-responses", OpenAICodexResponsesOptions, SimpleStreamOptions>
> {
	openAICodexResponsesProviderModulePromise ||= import("#ai/providers/openai/codex-responses").then((module) => {
		const provider = module as OpenAICodexResponsesProviderModule;
		return {
			stream: provider.streamOpenAICodexResponses,
			streamSimple: provider.streamSimpleOpenAICodexResponses,
		};
	});
	return openAICodexResponsesProviderModulePromise;
}

function loadOpenAICompletionsProviderModule(): Promise<
	LazyProviderModule<"openai-completions", OpenAICompletionsOptions, SimpleStreamOptions>
> {
	openAICompletionsProviderModulePromise ||= import("#ai/providers/openai/completions").then((module) => {
		const provider = module as OpenAICompletionsProviderModule;
		return {
			stream: provider.streamOpenAICompletions,
			streamSimple: provider.streamSimpleOpenAICompletions,
		};
	});
	return openAICompletionsProviderModulePromise;
}

function loadOpenAIResponsesProviderModule(): Promise<
	LazyProviderModule<"openai-responses", OpenAIResponsesOptions, SimpleStreamOptions>
> {
	openAIResponsesProviderModulePromise ||= import("#ai/providers/openai/responses").then((module) => {
		const provider = module as OpenAIResponsesProviderModule;
		return {
			stream: provider.streamOpenAIResponses,
			streamSimple: provider.streamSimpleOpenAIResponses,
		};
	});
	return openAIResponsesProviderModulePromise;
}

export const streamAnthropic = createLazyStream(loadAnthropicProviderModule);
export const streamSimpleAnthropic = createLazySimpleStream(loadAnthropicProviderModule);
export const streamOpenAICodexResponses = createLazyStream(loadOpenAICodexResponsesProviderModule);
export const streamSimpleOpenAICodexResponses = createLazySimpleStream(loadOpenAICodexResponsesProviderModule);
export const streamOpenAICompletions = createLazyStream(loadOpenAICompletionsProviderModule);
export const streamSimpleOpenAICompletions = createLazySimpleStream(loadOpenAICompletionsProviderModule);
export const streamOpenAIResponses = createLazyStream(loadOpenAIResponsesProviderModule);
export const streamSimpleOpenAIResponses = createLazySimpleStream(loadOpenAIResponsesProviderModule);

export function registerBuiltInApiProviders(): void {
	registerApiProvider({
		api: "anthropic-messages",
		stream: streamAnthropic,
		streamSimple: streamSimpleAnthropic,
	});

	registerApiProvider({
		api: "openai-completions",
		stream: streamOpenAICompletions,
		streamSimple: streamSimpleOpenAICompletions,
	});

	registerApiProvider({
		api: "openai-responses",
		stream: streamOpenAIResponses,
		streamSimple: streamSimpleOpenAIResponses,
	});

	registerApiProvider({
		api: "openai-codex-responses",
		stream: streamOpenAICodexResponses,
		streamSimple: streamSimpleOpenAICodexResponses,
	});
}

export function resetApiProviders(): void {
	clearApiProviders();
	registerBuiltInApiProviders();
}

registerBuiltInApiProviders();
