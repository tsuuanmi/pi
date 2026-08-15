# Pi Integration

Internet uses public Pi extension APIs only.

## Providers

`registerInternetProviders()` composes three backends:

- ChatGPT Web: Pi's built-in `openai-responses` transport targets the per-account loopback daemon.
- Anthropic: `anthropic-messages` targets the native Anthropic API.
- Google: `openai-completions` targets Google's documented compatibility endpoint.

Account-derived provider names are stable and are also the allowlist for council model selection.

## Hooks and events

- `before_provider_request` recognizes only ChatGPT Web provider names, ensures the matching daemon
  is authenticated/healthy, and adds daemon request identity/environment metadata. API providers
  bypass daemon hooks.
- `tool_call` recognizes only `mcp__codexwebgpt__*` tools and applies account bridge validation plus
  Pi approval.
- `turn_end` refreshes HUD status without mutating lifecycle state.

## Tools

Tools use Pi's TypeBox extension contract directly. Stateful dependencies are explicit:
`OwnedDaemonManager` for browser lifecycle, `InternetSettingsService` for settings, and
`CouncilService` for orchestration. Council execution consumes `context.sessionServices.modelRegistry`
so it uses the current Pi auth/header resolution path and abort signal.

## Public API

`src/index.ts` exports normalized account/runtime/client types, backend model catalogs and generic
provider registration, `CouncilService`, hooks/tools registration, daemon lifecycle helpers, and
`VERSION`. Backend-specific registration functions remain internal; the generic backend registry is
the authoritative composition surface.
