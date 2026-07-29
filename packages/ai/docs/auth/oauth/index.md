# auth/oauth

Mirrors `src/auth/oauth/`.

## Files

- `index.ts` - OAuth exports, provider registry, and `getOAuthApiKey()`.
- `types.ts` - shared OAuth credential, callback, prompt, and provider interfaces.
- `device-code.ts` - RFC 8628-style device-code polling helper.
- `oauth-page.ts` - browser callback page HTML used by local callback flows.
- [`anthropic/index.ts`](anthropic/index.md) - Anthropic OAuth provider.
- [`openai-codex/index.ts`](openai-codex/index.md) - ChatGPT/OpenAI Codex OAuth provider.

## Provider registry

Built-in OAuth providers are Anthropic and OpenAI Codex. Use:

- `getOAuthProvider(id)`
- `getOAuthProviders()`
- `registerOAuthProvider(provider)`
- `unregisterOAuthProvider(id)`
- `resetOAuthProviders()`

Unregistering a built-in provider restores the built-in implementation instead of deleting it.

## Credentials and callbacks

`OAuthCredentials` contains `refresh`, `access`, `expires`, and provider-specific extra fields.

`OAuthLoginCallbacks` supplies UI hooks for login flows:

- `onAuth({ url, instructions? })`
- `onDeviceCode({ userCode, verificationUri, intervalSeconds?, expiresInSeconds? })`
- `onPrompt({ message, placeholder?, allowEmpty? })`
- `onSelect({ message, options })`
- optional `onProgress(message)`, `onManualCodeInput()`, and `signal`

## API key lookup

`getOAuthApiKey(providerId, credentialsByProvider)` returns `{ apiKey, newCredentials }` or `null` when no credentials exist. It refreshes expired credentials before returning the provider API key string.

## Device-code polling

`pollOAuthDeviceCodeFlow({ poll, intervalSeconds, expiresInSeconds, signal })` polls until:

- `poll()` returns `{ status: "complete", value }`, which resolves with `value`.
- `poll()` returns `{ status: "failed", message }`, which throws.
- the flow expires or is aborted.

`slow_down` responses increase the poll interval by five seconds as required by RFC 8628.

## Authorization input parsing

`parseOAuthAuthorizationInput(input)` accepts pasted callback URLs, query strings, `code#state`, or bare codes and returns `{ code?, state? }`.

`generatePKCE()` returns a browser-compatible `{ verifier, challenge }` pair.
