# OAuth Providers

The `@tsuuanmi/pi-ai/oauth` entry point provides login and token refresh for OAuth-based providers. Credential storage is the caller's responsibility.

## Supported OAuth Providers

| Provider | OAuth Method | Subscription Required |
|----------|-------------|----------------------|
| Anthropic | Device authorization flow | Claude Pro/Max |
| OpenAI Codex | Device code or browser login | ChatGPT Plus/Pro |

## Login Flows

### Anthropic Login

```typescript
import { loginAnthropic } from "@tsuuanmi/pi-ai/oauth";

const credentials = await loginAnthropic({
  onAuth: (url, instructions) => {
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

```typescript
import { loginOpenAICodex } from "@tsuuanmi/pi-ai/oauth";

const credentials = await loginOpenAICodex({
  onAuth: (url, instructions) => {
    console.log(`Open: ${url}`);
    if (instructions) console.log(instructions);
  },
  onPrompt: async (prompt) => {
    return await getUserInput(prompt.message);
  },
  onProgress: (message) => console.log(message),
});
```

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
  registerOAuthProvider,
  unregisterOAuthProvider,
} from "@tsuuanmi/pi-ai/oauth";
```

| Function | Description |
|----------|-------------|
| `getOAuthProvider(id)` | Get a built-in OAuth provider by ID |
| `registerOAuthProvider(provider)` | Register a custom OAuth provider |
| `unregisterOAuthProvider(id)` | Unregister a provider (restores built-in if applicable) |

## OAuth Provider Interface

Custom providers implement:

```typescript
interface OAuthProviderInterface {
  id: OAuthProviderId;
  name: string;
  login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
  refresh(credentials: OAuthCredentials): Promise<OAuthCredentials>;
  getApiKey(credentials: OAuthCredentials): Promise<string>;
}
```

## Callbacks Interface

```typescript
interface OAuthLoginCallbacks {
  onAuth: (url: string, instructions?: string) => void;
  onPrompt: (prompt: OAuthPrompt) => Promise<string>;
  onProgress: (message: string) => void;
}
```

| Callback | Description |
|----------|-------------|
| `onAuth` | Called with the authorization URL to display to the user |
| `onPrompt` | Called when user input is needed (e.g., authorization code) |
| `onProgress` | Called with status updates during the login flow |

## Browser Limitations

OAuth login flows are not supported in browser environments. Use a server-side proxy or backend service for web applications requiring OAuth-based authentication.