# providers/openai/provider

Mirrors `src/providers/openai/provider.ts`.

Provider naming and configuration for the ChatGPT Web provider.

## `providerName`

```ts
providerName(account: Pick<OpenAiInternetAccount, "id">): string
```

Returns `chatgpt-web` for the `default` account, else `chatgpt-web-<account.id>`.

## `createOpenAiProviderConfig`

```ts
createOpenAiProviderConfig(account: OpenAiInternetAccount): Promise<ProviderConfig>
```

Builds a Pi `ProviderConfig`:

- `name` — the account display name.
- `api` — `"openai-responses"` (Pi's built-in Responses API).
- `baseUrl` — `daemonBaseUrl(account, true)` (loopback `/v1`).
- `apiKey` — the fixed `"local-loopback"` placeholder; inference is protected by loopback binding,
  not this key.
- `authHeader` — `false`.
- `models` — `chatGptWebModels(await readOwnedDaemonCapabilities(account))`.

## `registerOpenAiProviders`

```ts
registerOpenAiProviders(pi, accounts): Promise<void>
```

Registers a provider for each enabled account whose provider is `openai`, using
`providerName(account)` as the provider id.
