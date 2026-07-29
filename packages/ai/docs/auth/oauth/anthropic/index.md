# auth/oauth/anthropic

Mirrors `src/auth/oauth/anthropic/index.ts`.

The Anthropic OAuth provider implements Claude Pro/Max login and token refresh for `@tsuuanmi/pi-ai/oauth`.

## Exports

- `loginAnthropic(options)` - starts an Anthropic OAuth browser flow and returns `OAuthCredentials`.
- `refreshAnthropicToken(refreshToken)` - refreshes an Anthropic access token.
- `anthropicOAuthProvider` - built-in `OAuthProviderInterface` with `id: "anthropic"`.

## Login behavior

`loginAnthropic()` uses PKCE and callback/manual-code UI hooks from `OAuthLoginCallbacks`. It calls `onAuth()` with the authorization URL, accepts callback URLs or pasted authorization codes through the shared parser, and returns credentials with refresh/access tokens and expiration.

## Provider behavior

`anthropicOAuthProvider` exposes login, refresh, and `getApiKey(credentials)`. `getApiKey()` returns the current access token for provider requests.
