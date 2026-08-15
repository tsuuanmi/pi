# providers/backend

Mirrors `src/providers/backend.ts`.

`InternetBackend` is the provider-registration boundary shared by all backends. A backend owns its
stable account provider name and registers enabled accounts through Pi's public
`registerProvider` API. Daemon lifecycle is intentionally not part of this contract because only
the ChatGPT Web backend owns a local process.
