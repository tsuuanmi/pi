# web/fetch

Mirrors `src/web/fetch.ts`.

Bounded, SSRF-safe public web page fetching. It resolves the destination DNS, rejects non-public
addresses, pins the connection to the resolved address, enforces content-type/encoding/length
limits, and converts HTML to readable text.

## Types

- `FetchedPage` — `{ url, contentType, text }`.
- `FetchPageOptions` — injectable `fetch`, `lookup`, `maxBytes`, `timeoutMs`, `maxRedirects`.

## Defaults

- `DEFAULT_MAX_BYTES` — `1_000_000`.
- `DEFAULT_TIMEOUT_MS` — `15_000`.
- `DEFAULT_MAX_REDIRECTS` — `5`.
- `TEXT_CONTENT_TYPES` — `text/`, `application/json`, `application/xml`, `application/xhtml+xml`.

## `fetchPage`

```ts
fetchPage(rawUrl, options?): Promise<FetchedPage>
```

1. Resolves `rawUrl` to a `URL`.
2. Follows up to `maxRedirects` redirects, recomputing the deadline signal each hop.
3. `publicAddress` requires HTTP/HTTPS, forbids URL credentials, resolves the hostname, and rejects
   when every resolved address is not a public address (blocking private, loopback, link-local,
   CGNAT, documentation, benchmarking, and reserved ranges for both IPv4 and IPv6). With an injected
   `fetch` it uses that; otherwise it uses `pinnedRequest`, which pins the TLS/HTTP connection to
   the resolved address via a custom `lookup` (defeating DNS rebinding).
4. Follows redirects (`location`) manually.
5. Rejects non-2xx responses, non-`identity` content encodings, unsupported content types, and
   oversized bodies (declared `content-length` or streamed beyond `maxBytes`).
6. Decodes the body and, for HTML content types, strips scripts/styles/tags and HTML entities into
   readable text; other text content is trimmed.

Timeout and body-size limits are enforced through an `AbortSignal.timeout` deadline and a bounded
stream reader, both abort-aware so cancelled requests reject promptly.
