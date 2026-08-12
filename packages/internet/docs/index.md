# Internet Package

Internet is the Linux-first Pi package that ships an isolated ChatGPT Web browser runtime and
registers it as a native Pi model provider. It vendors a fixed codex-chatgpt-web snapshot, embeds
Bun in the build artifact, owns first login and daemon lifecycle, and requires no other repository
at runtime.

> Status: **owned-daemon MVP implemented.** The model-metadata correction in the implementation
> review remains deliberately separate.

## Core documentation

- [Architecture](architecture.md) — process boundaries, lifecycle authority, security, and the
  accepted ~15.6K-line vendoring tradeoff.
- [How it works](how-it-works.md) — build, startup, first login, inference, and shutdown flows.
- [Implemented Layout](layout.md) — package-owned modules, vendor snapshot, and build output.
- [Pi Integration](pi-integration.md) — provider-scoped readiness stream, tools, hooks, and public
  API boundaries.
- [Implementation Phases](implementation-phases.md) — reviewed decisions and completed gates.
- [Implementation Review](review/implementation-review.md) — remaining model metadata, naming, and
  review findings.
- [Daemon Ownership Decisions](daemon-ownership-brainstorm.md) — investigation history, Bun/Node
  constraint, measured runtime footprint, and confirmed decisions.

## Design research

- [Source Repositories](source-repositories.md) — source map for Pi, codex-chatgpt-web, and
  Prometheus.
- [Comparison: Prometheus](comparison-prometheus.md) — browser-backend comparison and lessons.
- [Best of Both](best-of-both.md) — future hybrid network capture with DOM fallback and fusion.
- [Browser Design](browser-design.md) — isolated browser behavior and security checklist.
- [Multi-Account and Multi-Backend Brainstorm](multi-account-and-backends.md).
- [Feature Brainstorm](features-brainstorm.md).
- [Original MVP Review](review-and-brainstorm.md).

## Scope

Current production scope is ChatGPT Web through the bundled Responses daemon, including isolated
login, auto-start for authenticated accounts, lifecycle control, compaction, health/HUD, admin
control, and account routing. Claude/Gemini, hybrid capture, web tools, native Codex tool bridging,
and non-Linux artifacts are deferred without inert production stubs.
