# Internet Package

Internet is the Pi package that turns codex-chatgpt-web's browser-automation bridge into a
first-class Pi capability: **run a Codex turn through ChatGPT Web**, bridge **native Codex tools**
into that turn, run **compaction**, and **control the daemon** — all from inside a Pi agent.

This docs folder is the isolated home for the package. It describes the intended architecture, the
suggested source layout, how the package works, and how it plugs into the current Pi ecosystem.

> Status: **scaffolded.** The `src/` tree is populated with empty stubs and the package config
> follows the Pi package standard (so it can be linked into Pi). No behavior yet.

## Contents

- [MVP Review & Brainstorm](review-and-brainstorm.md) — **start here.** Reviews the design against
the MVP constraint (works with current Pi as-is) and locks the scope.
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
