# Node HTTP Proxy

HTTP proxy configuration for Node.js environments.

## Usage

```typescript
import { createProxyAgent, getProxyUrl } from "@tsuuanmi/pi-ai";
```

Provides HTTP/HTTPS proxy agent creation for routing LLM API requests through corporate proxies.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HTTP_PROXY` | HTTP proxy URL |
| `HTTPS_PROXY` | HTTPS proxy URL |
| `NO_PROXY` | Hosts to bypass proxy |

## See Also

- [Browser and Node.js](../browser-usage.md) - Environment detection
- [Utilities](../utilities.md) - Proxy configuration utilities