# providers/registry

Mirrors `src/providers/registry.ts`.

The authoritative registry maps `openai`, `anthropic`, and `google` to their provider registration
implementations. `registerInternetProviders()` registers each enabled account in deterministic
provider order. `internetProviderName()` resolves the same stable name used later to restrict council
members to models owned by this package.
