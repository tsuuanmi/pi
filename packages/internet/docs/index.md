# Internet Package

Internet is the Pi package that turns codex-chatgpt-web's browser-automation bridge into a
first-class Pi capability: **run a Codex turn through ChatGPT Web**, bridge **native Codex tools**
into that turn, run **compaction**, and **control the daemon** — all from inside a Pi agent.

This docs folder is the isolated home for the package. It describes the intended architecture, the
suggested source layout, how the package works, and how it plugs into the current Pi ecosystem.

> **Find the source:** see [Source Repositories](source-repositories.md) for a map of every concept
> to the exact files in the two reference repos (`codex-chatgpt-web` daemon and `prometheus`).

> Status: **scaffolded.** The `src/` tree is populated with empty stubs and the package config
> follows the Pi package standard (so it can be linked into Pi). No behavior yet.

## Contents

- [MVP Review & Brainstorm](review-and-brainstorm.md) — **start here.** Reviews the design against
the MVP constraint (works with current Pi as-is) and locks the scope.
- [Source Repositories](source-repositories.md) — a map of every concept to the exact source files in
the two reference repos (`codex-chatgpt-web` daemon and `prometheus`), plus the Pi host APIs.
- [Feature Brainstorm](features-brainstorm.md) — what to add next: web search + fetch (fills a
  real Pi gap), multi-account, daemon lifecycle/doctor, and the full-mode tool bridge.
- [Comparison: Prometheus](comparison-prometheus.md) — how internet compares to the Prometheus
  project (same idea: browser-based AI backends), with a feature table and lessons learned.
- [Best of Both: Hybrid Capture + Fusion](best-of-both.md) — network interception as primary
  capture with DOM fallback, and the fusion "ask all" feature (one synthesized answer across
  backends).
- [Browser Design](browser-design.md) — which browser the package uses (system Chrome via
  Playwright, owned by the daemon), its lifecycle, security, and production-readiness checklist.
- [Multi-Account & Multi-Backend Brainstorm](multi-account-and-backends.md) — how multiple accounts
  per provider map onto Pi (account = daemon instance), and the backend-adapter seam for future
  Claude / Gemini backends.
- [Architecture](architecture.md) — the design, the request path, the tool bridge, and the
  security model.
- [Suggested Layout](layout.md) — the proposed `packages/internet/` source tree, package.json
  exports, and build.
- [How it works](how-it-works.md) — the runtime flow end to end (adapter → browser → broker →
  bridge back to Responses SSE), plus the tool loop.
- [Pi ecosystem integration](pi-integration.md) — how the package plugs into Pi: extension API,
  tools, hooks, skills, subagents, and the daemon control surface.

## Scope

- **MVP backend: ChatGPT Web** via the codex-chatgpt-web daemon (`src/backends/openai/`). The MVP
  registers the daemon as a Pi `openai-responses` provider plus a thin tool surface.
- **Deferred:** Claude (`src/backends/anthropic/`) and Gemini (`src/backends/google/`) backends.
  The per-backend folder structure keeps them additive without shipping them now.

## One-line summary

`internet` lets a Pi agent run ChatGPT Web as a model backend (and, post-MVP, bridge Codex's native
tools into that turn), using the same loopback Responses daemon and turn broker that
codex-chatgpt-web already implements.
