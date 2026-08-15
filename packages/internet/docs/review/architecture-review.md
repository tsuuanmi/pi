# Internet — Architecture Review & Direction

This review consolidates the current state of `@tsuuanmi/pi-internet` against the five product
principles that define what this package should be. It is grounded in the actual source of the three
repos on disk and the implemented package code, and it records the decisions and the remaining work
for each principle.

> Status: **review.** This is a living direction document, not a proposal. It supersedes the older
> `review-and-brainstorm.md` framing where the two disagree, and it records the new features that
> have landed since the original MVP review.

Sources on disk:
- Pi monorepo: `/home/superman/workspaces/pi` (this package lives at `packages/internet`).
- codexweb (upstream, Council 3.x): `/home/superman/workspaces/codexweb` — `Nolane-x/codexweb`, HEAD `1ddeba4` (v3.3.1).
- codex-chatgpt-web (daemon, vendored): `/home/superman/workspaces/codex-chatgpt-web` — `miuuyy/codex-chatgpt-web`, HEAD `9f74486` (v2.1.9).
- Prometheus (browser multi-provider): `/home/superman/workspaces/prometheus` — `tsuuanmi/prometheus`, HEAD `1d0a166`.

---

## 1. Principle 1 — This is a Pi package: a provider Pi can register

**Confirmed and implemented.** The package's primary job is to make ChatGPT Web usable as a native
Pi model provider, not to be a standalone service.

### What is true today
- `extension.ts` composes the package and registers providers through Pi's native
  `openai-responses` transport. Pi owns standard request conversion and SSE decoding; the package
  contains **no duplicate Responses parser or replay cache**.
- One enabled account registers `chatgpt-web`; multiple enabled accounts register
  `chatgpt-web-<account-id>`. Provider names are stable and account-based.
- A provider-name-scoped `before_provider_request` hook performs lifecycle readiness without
  replacing Pi's API-wide stream registry.
- The package is a proper Pi extension: `package.json` has a `pi.extensions` manifest field, and it
  imports only public `@tsuuanmi/pi*` entry points. Pi does not depend on this package.

### The seam that keeps it a provider, not a tool bridge
The agent gets ChatGPT Web as a **model**. The `internet_*` tools (`status`, `compact`, `control`,
`daemon`, `doctor`, `harness`, `settings`, `accounts`, `search`, `fetch`) are a thin surface around
that provider. The full-mode `codex_*` local-tool bridge is approval-gated and account-scoped, not a
generic MCP/REST service.

### Direction
Keep provider registration as the centerpiece. Any future backend (Claude/Gemini) must plug into the
same `src/backends/` seam and register as a Pi provider, never as a standalone MCP/REST surface.

> See [plan/runtime-architecture-brainstorm.md](../plan/runtime-architecture-brainstorm.md) for the
> runtime design, [plan/mcp-tunnel-broker.md](../plan/mcp-tunnel-broker.md) for the MCP/tunnel/broker
> machinery, and [plan/council-via-orchestrator.md](../plan/council-via-orchestrator.md) for how the
> orchestrator could help with Council.

---

## 2. Principle 2 — Internet takes the "best of" three repos and is unique

The package is not a copy of any one repo. It is a deliberate composition, and the composition is
what makes it unique.

### What each repo contributes

| Concern | codexweb (Council 3.x) | codex-chatgpt-web (daemon) | Prometheus | internet takes |
|---|---|---|---|---|
| Browser runtime / Responses surface | Electron + Playwright Council | Bun daemon, `/v1/responses`, isolated login, replay, compaction, broker, MCP | Electron + Playwright, 11 providers | **codex-chatgpt-web daemon** (vendored) |
| Model-output capture | DOM (Council turns) | DOM parsing | Network interception (SSE/JSON) | **Hybrid** (interception primary, DOM fallback) — future |
| Multi-agent Council | ✅ core feature | ❌ | ❌ | **Future** (see §4) |
| Multi-provider breadth | ❌ | single ChatGPT path | 11-provider catalog | **Backend seam** — future API backends |
| Web search / fetch | ❌ | removed in `9f74486` | browser-based | **Keyless RSS + bounded SSRF-safe fetch** (unique) |
| `@file` / local tools | Council MCP | Full-mode broker/MCP | inline `@file` expansion | **Bounded workspace-local `@file`** (from Prometheus) |
| Integration surface | Electron app | HTTP daemon | MCP + REST | **Pi provider + tools** (unique) |
| Platform | 4-platform Electron | Bun runtime (platform-agnostic build) | Linux | **Linux now, macOS next** (see §5) |

### What makes internet unique
1. **Pi-native provider registration** — neither codexweb nor Prometheus registers as a Pi provider.
2. **Browser-optional** — only ChatGPT Web model routing needs the daemon's Chrome. Search/fetch and
   future API backends are browser-less.
3. **Self-contained** — vendors the daemon and embeds Bun; no other repo at runtime.
4. **Keyless, SSRF-safe web access** — `internet_search`/`internet_fetch` are not browser-driven and
   never forward daemon credentials.
5. **Owned lifecycle** — the package owns login/start/stop/restart and health-gated auto-start.

### Direction
The "best of both" table in `architecture.md` and `plan/best-of-both.md` is the source of truth for
what to take. The two highest-value future ports are **hybrid capture** (from Prometheus) and the
**backend seam** (multi-provider). Do not duplicate Prometheus's generic MCP runtime or its
browser-driven Claude/Gemini path; prefer API-based backends.

---

## 3. Principle 3 — Runtime design: use the current runtime

**Decision: use the current runtime — vendor the daemon and embed Bun as an isolated child process.**
This is the choice for the package, and it is not a comparison: Electron is not an option here.

### The canonical reason

> **The package registers ChatGPT Web (and other providers) as a provider inside Pi. That requires a
> small plugin Pi controls — not a standalone desktop application. The current runtime does this by
> reusing the mature daemon as an isolated child process over your existing system Chrome. A
> standalone app (Electron) would add a whole second browser and its own app shell, which fights the
> provider model and is pure overhead.**

Concretely, the current runtime wins on four points:

1. **Pi is the center** — a provider is a small plugin Pi loads and controls, not a big standalone
   app.
2. **No second browser** — we use your **system Chrome** via Playwright; no bundled Chromium.
3. **We control the lifecycle** — start/stop/login each account independently via a child process.
4. **Reuse the mature daemon as-is** — it already runs in Bun; we embed it unchanged.

### Why this is the right design (confirmed in `plan/daemon-ownership-brainstorm.md`)
- The daemon is a **Bun application** (`Bun.serve`, `Bun.zstdDecompress`, `Bun.main`, `Bun.which`).
  It cannot run as plain Node. Porting those calls to Node is high-risk behavior drift.
- Reimplementing browser automation natively is by far the largest scope (login, session, replay,
  compaction, SSE).
- Vendoring the daemon's existing ~15.6K lines and embedding Bun reuses all the hard-won behavior.

See [plan/runtime-architecture-brainstorm.md](../plan/runtime-architecture-brainstorm.md) for the
full statement of the decision.

### The accepted cost
- A **~184MB platform-specific runtime** (`dist/daemon/runtime/`): embedded Bun (~89MB) + bundled
  app + deps (~96MB).
- A **build step** that requires Bun at build time (`scripts/build-daemon.mjs` →
  `build-runtime-bundle.ts`).
- The vendored daemon is a **fixed snapshot** — no upstream sync.

### Current runtime architecture
```text
Pi process (Node)
├── provider registration + readiness hook
├── account registry + private config bootstrap
├── daemon lifecycle manager (OwnedDaemonManager)
├── daemon HTTP tools + HUD
├── settings + public web search/fetch
└── account-scoped Full-harness config

Bundled child runtime (embedded Bun)
└── codex-chatgpt-web: isolated Chrome, login/session, replay, compaction, SSE, turn ownership
```

### Lifecycle design (implemented)
- **Auto-start on load** for authenticated enabled accounts; no browser opens at startup for
  accounts without verified login.
- **Lazy login** on first real use, gated by the `autoLogin` opt-out flag.
- **Serialized per-account operations**; a healthy daemon already bound to the endpoint is reused.
- **Daemon-owned idle shutdown** (~1 minute without a new request/message) so short CLI runs reuse
  the headed browser and keep one ChatGPT conversation per Pi session.
- **Graceful shutdown** and tunnel connect/disconnect for Full mode.

### Direction / open design questions
- **Runtime portability** is the main open item (see §5). The build script is already
  platform-agnostic (`process.platform`); only `src/daemon/runtime.ts` hard-gates Linux.
- **Hybrid capture** (interception primary, DOM fallback) is the top robustness investment for the
  core path. Prefer implementing it in the vendored daemon so DOM/SSE stay one owned path.
- **Footprint**: 184MB is heavy. If a smaller runtime matters later, revisit whether the embedded
  Bun can be trimmed, but do not port to Node.

---

## 4. Principle 4 — Multi-agent Council is a future idea

**Agreed — future, not now.** The Council is codexweb 3.x's headline feature and is deliberately out
of scope for the current package.

### What Council is (from `codexweb/docs/council.md`)
- An Electron-first multi-agent system: a ChatGPT Project Lead spawns managed child agents
  (Alice/Bob/Carol) that run in persistent ChatGPT conversations.
- Managed state (id/name/role/mandate/permissions/conversation URL/checkpoint) is private; the
  dashboard sees only sanitized metadata.
- A browser response protocol (`<COUNCIL_ACTIONS>`) with actions like `SAY`, `WAKE`, `SPAWN_AGENT`,
  `CREATE_TASK`, `FINAL_DECISION`, `CHECKPOINT`, `SLEEP`.
- Atomic action application, a decision gate, durable wake delivery, and a resurrection packet.
- ~2,843 lines of `src/council/` in codexweb HEAD.

### Why it is future
- The current package is a **single-session provider path** — one ChatGPT conversation per Pi
  session, no multi-agent orchestration.
- Council is Electron-first and depends on the launcher app, which the package deliberately does not
  ship (it embeds only the headless Bun daemon).
- The vendored snapshot (v2.1.8) predates Council entirely; Council exists only in codexweb 3.x.

### Direction
Keep Council as a **future idea** and do not build Council-specific machinery now. If it is pursued
later, the natural path is to re-vendor a newer codexweb snapshot that includes `src/council/` and
the launcher, then expose Council as a Pi-facing capability. Do not hand-roll a parallel multi-agent
system in the package. The current durable-conversation and canary work is the correct foundation to
build on, but it is not Council.

---

## 5. Principle 5 — Support both macOS and Linux

**Both Linux and macOS are required targets.** Linux is implemented; **macOS is a requirement, not
an optional next step**. This is the largest concrete gap between the current package and the stated
goal.

### Current state
- `src/daemon/runtime.ts` hard-gates: `if (platform !== "linux") throw ... "supports Linux only"`.
- The built artifact is `linux-x64` (`dist/daemon/runtime/manifest.json` pins `platform: "linux"`,
  `arch: "x64"`).
- Docs describe the package as "Linux-first".

### What already works for macOS (in the vendored daemon)
- `scripts/build-runtime-bundle.ts` is **platform-agnostic** — it uses `process.platform`/`process.arch`
  and produces a darwin bundle when run on macOS. `scripts/build-daemon.mjs` just invokes it.
- `src/config.ts` `defaultChromeExecutable()` already returns the macOS path
  (`/Applications/Google Chrome.app/.../Google Chrome`) for `darwin`.
- The macOS-only gate in `src/setup.ts` (lines 269–272) blocks only the **terminal-only managed
  Chrome setup** convenience flow on non-macOS; `login` and `serve` are not macOS-gated. The package
  uses `login`/`serve`, not `setup`, so this gate does not block the package path.

### What macOS support requires
1. **Relax `src/daemon/runtime.ts`** to accept `darwin` (and validate the manifest's platform/arch
   against the running platform instead of hard-coding `linux`).
2. **Build the runtime on macOS** (or cross-build) so `dist/daemon/runtime/` contains a darwin
   artifact. The build script already supports this; the package build must produce the right
   platform artifact per host.
3. **Verify the isolated Chrome login and headed inference** on macOS (Keychain-aware profile
   reopening, the v2.1.9 login capture flow).
4. **Update docs** from "Linux-first" to "Linux and macOS" once darwin artifacts are produced and
   tested.
5. **CI**: add a macOS build/smoke lane so the darwin artifact is verified, not just produced.

### Direction
macOS is a well-scoped port: the daemon already handles darwin Chrome paths (system Chrome via
Playwright is the preferred browser on both platforms) and the build is platform-agnostic. The work
is mostly in the package boundary (`runtime.ts`), the build/CI, and verification. Windows is not a
stated goal and should stay out of scope.

---

## 6. New features landed since the original MVP review

The original `review-and-brainstorm.md` framed the MVP as "provider + thin tools + HUD + one hook."
Since then the following have been implemented and are now production scope:

- **R1 — Fixed-effort model metadata.** Models mirror the daemon's single-immutable-effort routes
  (`light`/`medium`/`high`/`extra-high`/`pro`/`luna`), capability-gated, with a conservative 16,384
  output ceiling. Provider-local ids render as `chatgpt-web/high` instead of a doubled prefix.
- **R2 — `autoLogin` opt-out flag.** Lazy login is opt-out via `internet_settings`; headless users
  are not surprised by a Chrome window.
- **R2b — Conversation continuity + unobtrusive headed browser.** One ChatGPT conversation per Pi
  session, full-history replay fallback, ~1-minute idle shutdown, small top-left window, and the
  read-only warning no longer repeats in browser-only turns.
- **R3 — `internet_search` + `internet_fetch`.** Keyless RSS search plus bounded, SSRF-aware page
  fetching. Read-only, no interactive approval.
- **R4 — `internet_doctor`.** Bounded, cancellable `doctor --json` diagnostics with strict report
  validation.
- **R4b — Full harness / local file access.** Account-scoped `internet_harness`; safe static `@file`
  expansion in both modes; Full mode wires the vendored broker/MCP path with private runtime-key
  storage.
- **Durable conversation mode.** Canary-gated, account-scoped `internet_account_conversation_mode`;
  accounts default to isolated Temporary Chat. Durable v1 rejects attachments and ambiguous/replayed/
  diverged turns.
- **Account-scoped tools and stable provider names.** `chatgpt-web` for `default`, `chatgpt-web-<id>`
  for others; enabling/disabling unrelated accounts does not rename a provider.
- **Owned daemon lifecycle.** Package-owned private config, isolated Chrome login, health-gated
  auto-start, serialized lifecycle, graceful shutdown, and the `internet_daemon` tool.

### Remaining roadmap (from `plan/roi-roadmap.md`)
- **R5 — Hybrid capture** (interception primary, DOM fallback): top medium-effort investment to
  harden the core path against ChatGPT UI churn.
- **R6 — Multi-backend seam + Fusion** (`internet_ask_all`): later, larger bet.
- **R7 — Full-mode tool bridge** (`codex_tool_call`/`exec`/`apply_patch`): later, approval-gated.

---

## 7. Bottom line

The package is on the right track against all five principles:

1. **Pi provider** — implemented and is the centerpiece.
2. **Best of three repos** — the composition (daemon runtime + Prometheus `@file`/hybrid ideas +
   Pi-native integration) is what makes it unique.
3. **Runtime** — use the current runtime: vendor + embed Bun as an isolated child process over system
   Chrome. Electron is not an option (it fights the provider model and adds a second browser).
4. **Council** — correctly deferred as future; do not hand-roll a parallel system.
5. **macOS + Linux** — both are required targets; Linux is done, **macOS is the next concrete
   milestone** and is well-scoped (relax `runtime.ts`, build/verify a darwin artifact, update docs/CI).

The single highest-value next step is **macOS support** (Principle 5), because it is well-scoped and
directly closes the gap to the stated goal. After that, **hybrid capture** (R5) is the top
robustness investment for the core model path.
