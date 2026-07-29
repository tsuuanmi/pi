# auth/oauth/openai-codex

Mirrors `src/auth/oauth/openai-codex/index.ts`.

The OpenAI Codex OAuth provider implements ChatGPT login for Codex models and is exported from `@tsuuanmi/pi-ai/oauth`.

## Exports

- `OPENAI_CODEX_BROWSER_LOGIN_METHOD`
- `OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD`
- `loginOpenAICodex(options)` - selects browser or device-code login.
- `loginOpenAICodexDeviceCode(options)` - runs the device-code login flow directly.
- `refreshOpenAICodexToken(refreshToken)` - refreshes a ChatGPT/Codex access token.
- `openaiCodexOAuthProvider` - built-in `OAuthProviderInterface` with `id: "openai-codex"`.

## Login behavior

The provider can use a browser callback flow or device-code flow depending on callback support and user choice. Device-code login calls `onDeviceCode()` with the user code and verification URI, then polls with `pollOAuthDeviceCodeFlow()` until completion, failure, abort, or timeout.

## Provider behavior

`openaiCodexOAuthProvider` exposes login, refresh, and `getApiKey(credentials)`. The returned access token is used by Codex Responses streaming and usage helpers.
