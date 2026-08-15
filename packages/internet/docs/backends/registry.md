# backends/registry

Mirrors `src/backends/registry.ts`.

The authoritative registry maps `openai`, `anthropic`, and `google` to their provider registration
implementations. `registerInternetProviders()` registers each enabled account in deterministic
backend order. `internetProviderName()` resolves the same stable name used later to restrict council
members to models owned by this package.
