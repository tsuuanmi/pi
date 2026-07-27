# Adding a New Provider

Adding a provider should keep the package structure explicit and minimal.

## 1. Protocol and Model Types

- Add the API identifier to `KnownApi` in `src/protocol/ids.ts`.
- Add the provider name to `KnownProviderId` when it should appear in model catalogs.
- Add provider-specific options only when `StreamOptions` is not enough.

## 2. Provider Implementation

Create a provider folder with an `index.ts`, for example:

```text
src/provider/bedrock/index.ts
```

Export one public stream function, such as `streamBedrock()`. The function should:

1. Convert `Context` messages to the provider request format.
2. Build the provider request payload.
3. Send the request.
4. Parse SSE, WebSocket, or response events into `AssistantMessageEvent` values.
5. Return an `AssistantMessageEventStream`.
6. Push an `error` event and end the stream on failures.

## 3. Built-in Registration

Update `src/provider/built-ins.ts`:

- Add a dynamic `import()` loader for the provider module.
- Register the API with `registerProvider()` in `registerBuiltInProviders()`.
- Add display metadata to `BUILT_IN_PROVIDER_DISPLAY_NAMES` when needed.

Do not statically import provider implementation modules from `built-ins.ts`; dynamic imports keep startup fast.

## 4. Model Generation

Update `scripts/generate-models.ts` when the provider participates in generated model metadata.

## 5. Public Exports

Update:

- `src/index.ts` for provider-specific types that should be importable from `@tsuuanmi/pi-ai`.
- `package.json` subpath exports when direct provider imports are needed.

## 6. Tests

Add provider-specific tests under `packages/ai/test/provider/` covering streaming, tool use, usage reporting, aborts, and provider-specific behavior.

## 7. Docs

Update `packages/ai/README.md` and the relevant docs page under `packages/ai/docs/providers/`.
