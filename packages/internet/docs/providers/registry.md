# providers/registry

Mirrors `src/providers/registry.ts`.

The authoritative registry maps `openai`, `gemini-web`, `anthropic`, and `google` to their provider
registration implementations. `registerInternetProviders()` registers each enabled account in
deterministic provider order. `internetProviderName()` resolves the same stable name used later to
restrict council members to models owned by this package.

The registry stores each browser provider's request adapter directly, without mutable registration
order. The before-provider hook dispatches by
account provider ID: ChatGPT receives its Codex environment metadata, while Gemini receives only the
stable Pi session/turn identity and a namespaced Gemini model ID. The runtime uses that Pi session ID
as the one-to-one native Gemini chat key.
