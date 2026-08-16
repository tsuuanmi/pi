# Internet Documentation

`@tsuuanmi/pi-internet` provides package-owned ChatGPT Web browser inference on Linux/macOS,
Anthropic and Gemini API account providers, bounded council orchestration, Full-mode local-tool
bridging, and safe public web access.

## User and architecture guides

- [Usage](usage.md)
- [Architecture](architecture.md)
- [How it works](how-it-works.md)
- [Implemented layout](layout.md)
- [Pi integration](pi-integration.md)
- [Settings](settings.md)
- [Hooks](hooks.md)
- [Extension composition](extension.md)
- [Version](version.md)

## Source-mirrored reference

### Accounts and core

- [`accounts/registry`](accounts/registry.md)
- [`core/types`](core/types.md)
- [`core/errors`](core/errors.md)

### Providers

- Shared [`provider`](providers/provider.md), [`names`](providers/names.md), and
  [`registry`](providers/registry.md)
- Anthropic [`index`](providers/anthropic/index.md), [`models`](providers/anthropic/models.md), and
  [`provider`](providers/anthropic/provider.md)
- Google [`index`](providers/google/index.md), [`models`](providers/google/models.md), and
  [`provider`](providers/google/provider.md)
- ChatGPT Web [`index`](providers/openai/index.md), [`models`](providers/openai/models.md), and
  [`provider`](providers/openai/provider.md)
- ChatGPT daemon [`auth`](providers/openai/daemon/auth.md),
  [`client`](providers/openai/daemon/client.md), [`routes`](providers/openai/daemon/routes.md), and
  [`status`](providers/openai/daemon/status.md)
- ChatGPT turn [`files`](providers/openai/turn/files.md), [`model`](providers/openai/turn/model.md), and
  [`request`](providers/openai/turn/request.md)

### Runtime and orchestration

- Daemon [`config`](daemon/config.md), [`doctor`](daemon/doctor.md), [`harness`](daemon/harness.md),
  [`health`](daemon/health.md), [`manager`](daemon/manager.md), and [`runtime`](daemon/runtime.md)
- Council [`service`](council/service.md)

### Tools and web

- Tools [`accounts`](tools/accounts.md), [`compact`](tools/compact.md),
  [`control`](tools/control.md), [`conversations`](tools/conversations.md),
  [`council`](tools/council.md), [`daemon`](tools/daemon.md), [`doctor`](tools/doctor.md),
  [`harness`](tools/harness.md), [`register`](tools/register.md), [`settings`](tools/settings.md),
  [`status`](tools/status.md), and [`web`](tools/web.md)
- Public web [`fetch`](web/fetch.md) and [`search`](web/search.md)

## Implementation and review records

- [Completed implementation plan](plan/implementation-plan.md)
- [Runtime architecture analysis](plan/runtime-architecture-brainstorm.md)
- [MCP/tunnel broker analysis](plan/mcp-tunnel-broker.md)
- [Multi-account sign-in analysis](plan/multi-account-signin.md)
- [Council design](plan/council-via-orchestrator.md)
- [Multi-account/provider design](plan/multi-account-and-providers.md)
- [Pi-owned provider runtime](plan/codex-chatgpt-web-pi-owned.md)
- [Architecture review](review/architecture-review.md)
- [Implementation review](review/implementation-review.md)
- [Durable conversation lifecycle and recovery](review/durable-conversations.md)
- [Provider-neutral runtime boundary](review/daemon-boundary.md)
- [Former `codex-chatgpt-web` runtime review](review/codex-chatgpt-web-review.md)

The brainstorm/review files preserve design history. Source and the mirrored references above are the
authoritative current behavior.
