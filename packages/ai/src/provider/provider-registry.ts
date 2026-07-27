import type { Model, StreamFunction } from "#ai/model/index";
import type { Context } from "#ai/protocol/context";
import type { Api } from "#ai/protocol/ids";
import type { StreamOptions } from "#ai/protocol/options";
import type { AssistantMessageEventStream } from "#ai/transport/event-stream";

export type ProviderStreamFunction = (
	model: Model<Api>,
	context: Context,
	options?: StreamOptions,
) => AssistantMessageEventStream;

export interface Provider<TApi extends Api = Api, TOptions extends StreamOptions = StreamOptions> {
	api: TApi;
	stream: StreamFunction<TApi, TOptions>;
}

interface RegisteredProviderRuntime {
	api: Api;
	stream: ProviderStreamFunction;
}

type RegisteredProvider = {
	provider: RegisteredProviderRuntime;
	sourceId?: string;
};

const providerRegistry = new Map<string, RegisteredProvider>();

function wrapStream<TApi extends Api, TOptions extends StreamOptions>(
	api: TApi,
	stream: StreamFunction<TApi, TOptions>,
): ProviderStreamFunction {
	return (model, context, options) => {
		if (model.api !== api) {
			throw new Error(`Mismatched api: ${model.api} expected ${api}`);
		}
		return stream(model as Model<TApi>, context, options as TOptions);
	};
}

export function registerProvider<TApi extends Api, TOptions extends StreamOptions>(
	provider: Provider<TApi, TOptions>,
	sourceId?: string,
): void {
	providerRegistry.set(provider.api, {
		provider: {
			api: provider.api,
			stream: wrapStream(provider.api, provider.stream),
		},
		sourceId,
	});
}

export function getProvider(api: Api): RegisteredProviderRuntime | undefined {
	return providerRegistry.get(api)?.provider;
}

export function getProviders(): RegisteredProviderRuntime[] {
	return Array.from(providerRegistry.values(), (entry) => entry.provider);
}

export function unregisterProviders(sourceId: string): void {
	for (const [api, entry] of providerRegistry.entries()) {
		if (entry.sourceId === sourceId) {
			providerRegistry.delete(api);
		}
	}
}

export function clearProviders(): void {
	providerRegistry.clear();
}

export type SessionResourceCleanup = (sessionId?: string) => void;

const sessionResourceCleanups = new Set<SessionResourceCleanup>();

export function registerSessionResourceCleanup(cleanup: SessionResourceCleanup): () => void {
	sessionResourceCleanups.add(cleanup);
	return () => {
		sessionResourceCleanups.delete(cleanup);
	};
}

export function cleanupSessionResources(sessionId?: string): void {
	const errors: unknown[] = [];
	for (const cleanup of sessionResourceCleanups) {
		try {
			cleanup(sessionId);
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0) {
		throw new AggregateError(errors, "Failed to cleanup session resources");
	}
}
