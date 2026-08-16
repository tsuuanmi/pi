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
- [Future work](future-work.md)

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
- Private runtime [`source reference`](../runtime/docs/index.md)
- Council [`service`](council/service.md)

### Tools and web

- Tools [`accounts`](tools/accounts.md), [`compact`](tools/compact.md),
  [`control`](tools/control.md), [`conversations`](tools/conversations.md),
  [`council`](tools/council.md), [`daemon`](tools/daemon.md), [`doctor`](tools/doctor.md),
  [`harness`](tools/harness.md), [`register`](tools/register.md), [`settings`](tools/settings.md),
  [`status`](tools/status.md), and [`web`](tools/web.md)
- Public web [`fetch`](web/fetch.md) and [`search`](web/search.md)

The source and the mirrored references above are the authoritative current behavior. Features that
were designed but are not yet implemented are tracked in [Future work](future-work.md).
