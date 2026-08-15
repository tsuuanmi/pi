# providers/provider

Mirrors `src/providers/provider.ts`.

`InternetProvider` is the provider-registration boundary shared by all providers. A provider owns its
stable account provider name and registers enabled accounts through Pi's public
`registerProvider` API. Daemon lifecycle is intentionally not part of this contract because only
the ChatGPT Web provider owns a local process.
