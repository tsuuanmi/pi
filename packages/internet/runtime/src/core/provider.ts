import type { AdapterEvent } from "#runtime/core/protocol/types";

/** Metadata about the caller's incoming request, retained without provider-specific fields. */
export interface IncomingRequestMeta {
  headers: Headers;
  abortSignal?: AbortSignal;
}

/** Provider implementation contract registered by the runtime composition root. */
export interface RuntimeProviderAdapter<TRequest> {
  readonly name: string;
  runTurn(
    parsed: TRequest,
    incoming: IncomingRequestMeta,
    emit: (event: AdapterEvent) => void,
  ): Promise<void>;
}

export type RuntimeAdapterId = "chatgpt-web" | "gemini-web";

export interface RuntimeHttpServer {
  readonly port?: number;
}

export interface RuntimeServerFactory<TConfig = unknown> {
  readonly adapter: RuntimeAdapterId;
  serve(config: TConfig, dependencies?: { onShutdown?: () => void }): RuntimeHttpServer;
}

const factories = new Map<RuntimeAdapterId, RuntimeServerFactory<unknown>>();

/** Register concrete providers from the executable composition root. */
export function registerRuntimeServer<TConfig>(factory: RuntimeServerFactory<TConfig>): void {
  if (factories.has(factory.adapter)) throw new Error(`Runtime provider already registered: ${factory.adapter}`);
  factories.set(factory.adapter, factory as RuntimeServerFactory<unknown>);
}

export function runtimeServerFactory(adapter: RuntimeAdapterId): RuntimeServerFactory<unknown> {
  const factory = factories.get(adapter);
  if (!factory) throw new Error(`Runtime provider is not registered: ${adapter}`);
  return factory;
}

export function clearRuntimeServerFactories(): void {
  factories.clear();
}
