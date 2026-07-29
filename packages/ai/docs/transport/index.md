# transport

Mirrors `src/transport/`.

## Files

- `event-stream.ts` - generic async event stream, assistant stream specialization, stream factory, and header conversion.
- `http-proxy.ts` - HTTP(S) proxy URL resolution from environment-style settings.
- `proxy.ts` - client stream function for server-proxied provider calls.

## Event streams

`EventStream<T, R>` implements `AsyncIterable<T>` with queueing, completion detection, and a `result()` promise.

`AssistantMessageEventStream` specializes it for `AssistantMessageEvent` and resolves to the final `AssistantMessage` on terminal `done` or `error` events.

`createAssistantMessageEventStream()` creates an assistant stream for extensions and custom providers.

## HTTP proxy resolution

`resolveHttpProxyUrlForTarget(targetUrl, env?)` reads protocol-specific proxy settings and `no_proxy` from `env` first, then process environment. Supported proxy protocols are HTTP and HTTPS only; SOCKS and PAC URLs throw `UNSUPPORTED_PROXY_PROTOCOL_MESSAGE`.

## Server proxy streaming

`streamProxy(model, context, options)` sends a request to `${proxyUrl}/api/stream` with bearer auth and reconstructs full assistant partials from compact proxy events.

`ProxyStreamOptions` includes serializable stream fields plus:

- `authToken` - bearer token for the proxy server.
- `proxyUrl` - base URL of the proxy server.
- `signal` - local abort signal for the proxy request.
