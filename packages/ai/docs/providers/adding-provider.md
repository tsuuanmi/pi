# Adding a New Provider

Adding a new LLM provider requires changes across multiple files. This checklist covers all steps.

## 1. Core Types (`src/core/types.ts`)

- Add the API identifier to `KnownApi` (e.g., `"bedrock-converse"`)
- Create an options interface extending `StreamOptions` (e.g., `BedrockOptions`)
- Add the provider name to `KnownProvider` (e.g., `"amazon-bedrock"`)

## 2. Provider Implementation (`src/providers/<provider>/`)

Create a provider-specific folder and entry file (e.g., `src/providers/bedrock/index.ts`) that exports:

- `stream<Provider>()` function returning `AssistantMessageEventStream`
- `streamSimple<Provider>()` for `SimpleStreamOptions` mapping
- Provider-specific options interface
- Message conversion functions to transform `Context` to provider format
- Tool conversion if the provider supports tools
- Response parsing to emit standardized events (`text`, `tool_call`, `thinking`, `usage`, `stop`)

The stream function must:

1. Convert `Context` messages to the provider's format
2. Build the provider-specific request payload
3. Send the request to the provider API
4. Parse SSE or WebSocket responses into `AssistantMessageEvent` objects
5. Push events into an `AssistantMessageEventStream`
6. Handle errors by pushing an `error` event and ending the stream

## 3. API Registry Integration (`src/providers/register-builtins.ts`)

- Add a lazy loader wrapper for the new provider module
- Register the API with `registerApiProvider()` in `registerBuiltInApiProviders()`
- Add a package subpath export in `package.json` for the provider module (`./dist/providers/<provider>/index.js`)
- Add `export type` re-exports in `src/index.ts` for any provider-specific types that should be importable from `@tsuuanmi/pi-ai`
- Add credential detection in `src/auth/env-api-keys.ts` for the new provider
- Ensure `streamSimple` handles auth lookup via `getEnvApiKey()` or provider-specific auth

Example lazy loader:

```typescript
let bedrockProviderModulePromise:
  | Promise<LazyProviderModule<"bedrock-converse", BedrockOptions, SimpleStreamOptions>>
  | undefined;

function loadBedrockProviderModule(): Promise<...> {
  bedrockProviderModulePromise ||= import("#ai/providers/bedrock/index").then((module) => {
    const provider = module as BedrockProviderModule;
    return { stream: provider.streamBedrock, streamSimple: provider.streamSimpleBedrock };
  });
  return bedrockProviderModulePromise;
}

export const streamBedrock = createLazyStream(loadBedrockProviderModule);
export const streamSimpleBedrock = createLazySimpleStream(loadBedrockProviderModule);
```

**Important**: Do not statically import provider implementation modules in `register-builtins.ts`. Use dynamic `import()` to keep startup fast.

## 4. Model Generation (`scripts/generate-models.ts`)

- Add logic to fetch and parse models from the provider's source
- Map provider model data to the standardized `Model` interface
- Handle provider-specific quirks (pricing format, capability flags, model ID transformations)

## 5. Tests (`test/`)

Add tests under `packages/ai/test/` covering:

- Streaming and tool use
- Token usage reporting
- Request abort
- Context replay
- Provider-specific features

Follow the existing provider-specific test pattern (e.g., `anthropic-sse-parsing.test.ts`, `openai-codex-stream.test.ts`).

For scripted deterministic flows, use `registerFauxProvider()` instead of hitting a live API.

## 6. Pi Integration (`../pi/`)

Update `packages/pi/src/model/model-resolver.ts`:

- Add a default model ID for the provider in `defaultModelPerProvider`

Update `src/cli/args.ts`:

- Add environment variable documentation in the help text

## 7. Documentation

Update `packages/ai/README.md` and `packages/ai/docs/`:

- Add the provider to the Supported Providers table
- Document any provider-specific options or authentication requirements
- Add environment variable to the Environment Variables section
- Update `api-registry.md` and `models.md` with the new provider

## 8. Changelog

Add an entry to `packages/ai/CHANGELOG.md` under `## [Unreleased]`:

```markdown
### Added
- Added support for [Provider Name] provider
```