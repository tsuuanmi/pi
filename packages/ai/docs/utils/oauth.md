# OAuth Providers

The `@tsuuanmi/pi-ai/oauth` entry point provides login and token refresh for OAuth-based providers. Credential storage is the caller's responsibility.

## Supported OAuth Providers

| Provider | Login Functions | Subscription Required |
|----------|----------------|----------------------|
| Anthropic | `loginAnthropic` | Claude Pro/Max |
| OpenAI Codex | `loginOpenAICodex` (browser) / `loginOpenAICodexDeviceCode` (device code) | ChatGPT Plus/Pro |

## Login Flows

### Anthropic Login

```typescript
import { loginAnthropic } from "@tsuuanmi/pi-ai/oauth";

const credentials = await loginAnthropic({
  onAuth: ({ url, instructions }) => {
    console.log(`Open: ${url}`);
    if (instructions) console.log(instructions);
  },
  onPrompt: async (prompt) => {
    return await getUserInput(prompt.message);
  },
  onProgress: (message) => console.log(message),
});
```

### OpenAI Codex Login

Browser-based login (default):

```typescript
import { loginOpenAICodex } from "@tsuuanmi/pi-ai/oauth";

const credentials = await loginOpenAICodex({
  onAuth: ({ url, instructions }) => {
    console.log(`Open: ${url}`);
    if (instructions) console.log(instructions);
  },
  onPrompt: async (prompt) => {
    return await getUserInput(prompt.message);
  },
  onProgress: (message) => console.log(message),
});
```

Device-code flow (headless):

```typescript
import { loginOpenAICodexDeviceCode } from "@tsuuanmi/pi-ai/oauth";

const credentials = await loginOpenAICodexDeviceCode({
  onAuth: ({ url, instructions }) => console.log(`Visit: ${url}`),
  onProgress: (message) => console.log(message),
});
```

`loginOpenAICodex` also accepts an optional `onManualCodeInput` callback to let the user paste an authorization code if the local browser callback fails.

## Token Refresh

Use `getOAuthApiKey()` to get an API key, automatically refreshing if expired:

```typescript
import { getModel, complete } from "@tsuuanmi/pi-ai";
import { getOAuthApiKey } from "@tsuuanmi/pi-ai/oauth";
import { readFileSync, writeFileSync } from "fs";

// Load stored credentials
const auth = JSON.parse(readFileSync("auth.json", "utf-8"));

// Get API key (refreshes if expired)
const result = await getOAuthApiKey("openai-codex", auth);
if (!result) throw new Error("Not logged in");

// Save refreshed credentials
auth["openai-codex"] = { type: "oauth", ...result.newCredentials };
writeFileSync("auth.json", JSON.stringify(auth, null, 2));

// Use the API key
const model = getModel("openai-codex", "gpt-5.5");
const response = await complete(model, context, { apiKey: result.apiKey });
```

## OAuth Provider Registry

The OAuth module includes a registry for built-in and custom providers:

```typescript
import {
  getOAuthProvider,
  getOAuthProviders,
  registerOAuthProvider,
  unregisterOAuthProvider,
} from "@tsuuanmi/pi-ai/oauth";
```

| Function | Description |
|----------|-------------|
| `getOAuthProvider(id)` | Get a registered OAuth provider by ID |
| `getOAuthProviders()` | List all registered OAuth providers |
| `registerOAuthProvider(provider)` | Register a custom OAuth provider |
| `unregisterOAuthProvider(id)` | Unregister a provider by ID |

`getOAuthProviderInfoList()` and `refreshOAuthToken()` are deprecated; use `getOAuthProviders()` and `getOAuthProvider(id).refreshToken()` instead.

## OAuth Provider Interface

Custom providers implement:

```typescript
interface OAuthProviderInterface {
  readonly id: OAuthProviderId;
  readonly name: string;
  login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
  usesCallbackServer?: boolean;   // true if login uses a local callback server + manual code input
  refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;
  getApiKey(credentials: OAuthCredentials): string;
  modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[];
}
```

`OAuthCredentials` is `{ refresh, access, expires, [key]: unknown }`. Credential storage is the caller's responsibility.

## Callbacks Interface

```typescript
interface OAuthLoginCallbacks {
  onAuth: (info: { url: string; instructions?: string }) => void;
  onPrompt: (prompt: OAuthPrompt) => Promise<string>;
  onProgress?: (message: string) => void;
}
```

| Callback | Description |
|----------|-------------|
| `onAuth` | Called with `{ url, instructions? }` — the authorization URL to display to the user |
| `onPrompt` | Called when user input is needed (e.g., an authorization code) |
| `onProgress` | Called with status updates during the login flow |

## Browser Limitations

OAuth login flows are not supported in browser environments. Use a server-side proxy or backend service for web applications requiring OAuth-based authentication.
