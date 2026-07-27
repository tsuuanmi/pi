import type { Model, StreamFunction } from "#ai/model/index";
import type { Context } from "#ai/protocol/context";
import type { Api } from "#ai/protocol/ids";
import type { AssistantMessage, AssistantMessageEvent } from "#ai/protocol/message";
import type { StreamOptions } from "#ai/protocol/options";
import { clearProviders, registerProvider } from "#ai/provider/provider-registry";
import { AssistantMessageEventStream } from "#ai/transport/event-stream";

export const BUILT_IN_PROVIDER_DISPLAY_NAMES: Record<string, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	"openai-codex": "OpenAI Codex",
	"ollama-cloud": "Ollama Cloud",
};

interface ProviderModule<TApi extends Api, TOptions extends StreamOptions> {
	stream: (model: Model<TApi>, context: Context, options?: TOptions) => AsyncIterable<AssistantMessageEvent>;
}

interface AnthropicModule {
	streamAnthropic: StreamFunction<"anthropic-messages", StreamOptions>;
}

interface OpenAICodexResponsesModule {
	streamOpenAICodexResponses: StreamFunction<"openai-codex-responses", StreamOptions>;
}

interface OpenAICompletionsModule {
	streamOpenAICompletions: StreamFunction<"openai-completions", StreamOptions>;
}

interface OpenAIResponsesModule {
	streamOpenAIResponses: StreamFunction<"openai-responses", StreamOptions>;
}

let anthropicModule: Promise<ProviderModule<"anthropic-messages", StreamOptions>> | undefined;
let openAICodexResponsesModule: Promise<ProviderModule<"openai-codex-responses", StreamOptions>> | undefined;
let openAICompletionsModule: Promise<ProviderModule<"openai-completions", StreamOptions>> | undefined;
let openAIResponsesModule: Promise<ProviderModule<"openai-responses", StreamOptions>> | undefined;

function forwardStream(target: AssistantMessageEventStream, source: AsyncIterable<AssistantMessageEvent>): void {
	(async () => {
		for await (const event of source) {
			target.push(event);
		}
		target.end();
	})();
}

function createLoadErrorMessage<TApi extends Api>(model: Model<TApi>, error: unknown): AssistantMessage {
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

function createProviderStream<TApi extends Api, TOptions extends StreamOptions>(
	loadModule: () => Promise<ProviderModule<TApi, TOptions>>,
): StreamFunction<TApi, TOptions> {
	return (model, context, options) => {
		const outer = new AssistantMessageEventStream();

		loadModule()
			.then((module) => {
				const inner = module.stream(model, context, options);
				forwardStream(outer, inner);
			})
			.catch((error) => {
				const message = createLoadErrorMessage(model, error);
				outer.push({ type: "error", reason: "error", error: message });
				outer.end(message);
			});

		return outer;
	};
}

function loadAnthropicModule(): Promise<ProviderModule<"anthropic-messages", StreamOptions>> {
	anthropicModule ||= import("#ai/provider/anthropic/index").then((module) => ({
		stream: (module as AnthropicModule).streamAnthropic,
	}));
	return anthropicModule;
}

function loadOpenAICodexResponsesModule(): Promise<ProviderModule<"openai-codex-responses", StreamOptions>> {
	openAICodexResponsesModule ||= import("#ai/provider/openai/codex/responses").then((module) => ({
		stream: (module as OpenAICodexResponsesModule).streamOpenAICodexResponses,
	}));
	return openAICodexResponsesModule;
}

function loadOpenAICompletionsModule(): Promise<ProviderModule<"openai-completions", StreamOptions>> {
	openAICompletionsModule ||= import("#ai/provider/openai/completions/index").then((module) => ({
		stream: (module as OpenAICompletionsModule).streamOpenAICompletions,
	}));
	return openAICompletionsModule;
}

function loadOpenAIResponsesModule(): Promise<ProviderModule<"openai-responses", StreamOptions>> {
	openAIResponsesModule ||= import("#ai/provider/openai/responses/index").then((module) => ({
		stream: (module as OpenAIResponsesModule).streamOpenAIResponses,
	}));
	return openAIResponsesModule;
}

const streamRegisteredAnthropic = createProviderStream(loadAnthropicModule);
const streamRegisteredOpenAICodexResponses = createProviderStream(loadOpenAICodexResponsesModule);
const streamRegisteredOpenAICompletions = createProviderStream(loadOpenAICompletionsModule);
const streamRegisteredOpenAIResponses = createProviderStream(loadOpenAIResponsesModule);

export function registerBuiltInProviders(): void {
	registerProvider({ api: "anthropic-messages", stream: streamRegisteredAnthropic });
	registerProvider({ api: "openai-completions", stream: streamRegisteredOpenAICompletions });
	registerProvider({ api: "openai-responses", stream: streamRegisteredOpenAIResponses });
	registerProvider({ api: "openai-codex-responses", stream: streamRegisteredOpenAICodexResponses });
}

export function resetProviders(): void {
	clearProviders();
	registerBuiltInProviders();
}

registerBuiltInProviders();
