# Internet Implementation Plan — Completed

## Scope and validation

This plan was reconciled with the package-owned daemon implementation on 2026-08-15. The current
code already provided the fixed vendored ChatGPT Web snapshot, Linux runtime, model/provider
mapping, isolated multi-account daemons, durable conversations, public-web tools, and the Full-mode
broker/MCP tunnel. Reimplementing those paths would have created duplicate ownership, so the final
work retained them and closed only the verified architecture gaps.

## Completed sequence

### Tier 1 — macOS runtime support

- Runtime manifests now accept native Linux and macOS artifacts on x64/arm64.
- Manifest parsing rejects mismatched hosts, unsupported platforms, absolute/traversing launchers,
  and non-executable launchers.
- Owned daemon config selects the native Google Chrome executable on Linux or macOS.
- Package CI builds workspace dependencies and the internet package, runs the full package suite,
  and checks package contents on Ubuntu and macOS.
- The package build remains self-contained: Bun compiles the fixed vendored snapshot, and the host
  does not install Playwright browser payloads.

### Tier 2 — hybrid capture and guided login import

- ChatGPT browser turns attach a per-turn wire capture before submit, parse authenticated
  conversation SSE/JSON, and use the final assistant payload as the primary answer.
- The existing DOM extraction is the explicit compatibility fallback when wire capture is missing or
  invalid; capture provenance is logged as `wire` or `dom-fallback`.
- Login accepts a Playwright storage-state path as an alternative to interactive capture.
- Import rejects symlinks/non-files and files outside the 1-byte–10-MiB bound, removes every cookie
  and origin outside ChatGPT/OpenAI, validates field shapes, verifies the session in daemon-owned
  Chrome, and persists only after successful verification.
- Password and 2FA collection remain out of scope; no raw credential path exists.

### Tier 3 — Full harness verification surface

The existing implementation remains authoritative:

- `mode: "full"` config enables the vendored broker/MCP tunnel.
- Browser-worker serialization and replay remain unchanged.
- Pi's `tool_call` hook validates the account bridge and requests approval; default behavior denies
  execution.
- Doctor, harness lifecycle, durable conversation, and checkpoint tests remain in the package suite.

No second tool bridge or automation controller was introduced.

### Tier 4 — provider-neutral accounts and API providers

- Account records form a discriminated union for `openai`, `anthropic`, and `google`; the registry schema version is retained as metadata without gating loads.
- The registry validates exact provider fields, allocates unique browser ports, stores API-key
  environment references rather than secrets, and supports list/add/remove/enable/disable plus
  one durable ChatGPT conversation per Pi session.
- Daemon modules accept only `OpenAiInternetAccount`, making the process boundary explicit.
- `providers/registry.ts` is the sole provider composition path.
- Anthropic uses Pi's native `anthropic-messages` transport and package-aligned model metadata.
- Gemini uses Google's documented OpenAI-compatible endpoint with explicit Flash/Pro metadata.

### Tier 5 — council composition

- `CouncilService` selects only models owned by enabled internet accounts.
- `quick`, `balanced`, and `deep` presets select 2/3/4 models; explicit teams allow 2–6 unique
  `provider/model` selectors and an optional chair.
- Members run once without tools. `@tsuuanmi/pi-orchestrator` runs at most three members in parallel,
  then one dependency-aware synthesis task.
- Runs have no retries, one start per task, a ten-minute wall-clock budget, a 4,096-token response
  cap, and current-session abort/auth/header propagation.
- The existing Full-mode approval-gated tool bridge remains separate and authoritative.

## Resulting dependency boundaries

```text
AccountRegistry
  ├─ OpenAiInternetAccount -> OwnedDaemonManager -> vendored runtime -> Chrome
  ├─ AnthropicInternetAccount -> Pi anthropic-messages transport
  └─ GoogleInternetAccount -> Pi openai-completions transport

Enabled provider names -> CouncilService -> Orchestrator -> tool-free Pi Agents
```

No provider imports daemon lifecycle through the generic provider contract. No account stores an API
secret. No council member can select a provider outside the enabled internet account set.

## Verification contract

Automated checks cover runtime resolution on Linux/macOS manifests, platform Chrome defaults,
storage-state filtering, wire parsing, account schema/lifecycle, provider configs, council tool
routing, package build, package contents, root typecheck, formatting/lint, and the full internet test
suite.

Live ChatGPT login/inference/Full-mode and Anthropic/Gemini calls require operator-owned accounts,
credentials, and Chrome. They are release-environment smoke checks rather than alternate code paths;
a missing credential does not enable a mock, fallback provider, or compatibility implementation.
