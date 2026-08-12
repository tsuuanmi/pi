# Internet Package

Internet is the Linux-first Pi package that ships an isolated ChatGPT Web browser runtime and
registers it as a native Pi model provider. It vendors a fixed codex-chatgpt-web snapshot, embeds
Bun in the build artifact, owns first login and daemon lifecycle, and requires no other repository
at runtime.

> Status: **owned-daemon MVP plus R1–R4 implemented.** Fixed-effort models, explicit automatic-login
> settings, read-only web search/fetch, and account diagnostics are current production scope.

## Core documentation

- [Architecture](architecture.md) — process boundaries, lifecycle authority, security, and the
  accepted ~15.6K-line vendoring tradeoff.
- [How it works](how-it-works.md) — build, startup, first login, inference, and shutdown flows.
- [Implemented Layout](layout.md) — package-owned modules, vendor snapshot, and build output.
- [Pi Integration](pi-integration.md) — provider-scoped readiness stream, tools, hooks, and public
  API boundaries.
- [Implementation Phases](implementation-phases.md) — reviewed decisions and completed gates.
- [Implementation Review](review/implementation-review.md) — review findings and dispositions.
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
- [ROI Roadmap](roi-roadmap.md) — grounded, prioritized next features by impact/effort/risk.
- [Implemented Plan R1–R3](implementation-plan-r1-r3.md) — reviewed design and source-derived
  corrections for model metadata, `autoLogin`, and web search/fetch.
- [Implemented Plan R4 – `internet_doctor`](implementation-plan-doctor.md) — reviewed implementation
  for surfacing the daemon's `doctor --json` diagnostics as a Pi tool.
- [Original MVP Review](review-and-brainstorm.md).

## Scope

Current production scope is ChatGPT Web through the bundled Responses daemon, including isolated
login, auto-start for authenticated accounts, fixed-effort model routing, lifecycle control,
settings, compaction, health/HUD, account diagnostics, admin control, account routing, and read-only
web search/fetch. Claude/Gemini, hybrid capture, native Codex tool bridging, and non-Linux artifacts are deferred
without inert production stubs.
