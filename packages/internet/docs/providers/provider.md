# providers/provider

Mirrors `src/providers/provider.ts`.

`InternetProvider` is the provider-registration boundary shared by all providers. A provider owns its
stable account provider name and registers enabled accounts through Pi's public
`registerProvider` API. Browser providers also expose a static `requestAdapter` that receives the
Pi working directory, session ID, and turn ID; API providers omit it. Daemon lifecycle is
intentionally not part of this contract because only browser providers own local processes.
