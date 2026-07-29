# provider

Mirrors `src/provider/`.

## Files

- `built-ins.ts` - lazy registration of built-in providers.
- `config.ts` - provider environment lookup and header merging.
- `provider-registry.ts` - provider registration, lookup, cleanup, and session resource cleanup.
- `anthropic/` - Anthropic Messages implementation.
- `openai/` - OpenAI-family implementations and shared transforms.

## Provider registry

A provider binds an API id to a stream function:

```ts
type Provider<TApi extends Api = Api> = {
  api: TApi;
  stream: StreamFunction<TApi>;
};
```

Use `registerProvider(provider, sourceId?)` to add or replace a provider for an API. The registry wraps streams and rejects mismatched `model.api` values.

Other helpers:

- `getProvider(api)` returns the registered runtime provider.
- `getProviders()` returns all registered runtime providers.
- `unregisterProviders(sourceId)` removes providers registered by a source.
- `clearProviders()` clears the registry.
- `registerSessionResourceCleanup(cleanup)` registers cleanup for websocket/session resources.
- `cleanupSessionResources(sessionId?)` invokes all registered cleanup handlers and throws `AggregateError` if any fail.

## Built-ins

Importing `src/stream.ts` imports `provider/built-ins.ts`, which registers:

- `anthropic-messages`
- `openai-completions`
- `openai-responses`
- `openai-codex-responses`

Built-in provider modules are loaded lazily on first use. `resetProviders()` clears the registry and re-registers built-ins.

## Provider config helpers

`getProviderEnvValue(name, env?)` checks caller-provided `env` first, then `process.env` when available. `mergeHeaderSources(...sources)` returns a merged header object or `undefined` when no headers are present.
