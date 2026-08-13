# Internet — ROI Roadmap

Grounded, prioritized features for `@tsuuanmi/pi-internet` after the owned-daemon MVP. Each item
lists the evidence (docs + repo source), design, effort, impact, risk, and acceptance criteria so
the tradeoff is explicit before any code.

> Status: **R1–R4 implemented.** R5–R7 remain proposals.

Sources:
- Daemon repo `/home/superman/workspaces/codex-chatgpt-web` (vendored at commit `bda266b4`).
- Prometheus `/home/superman/workspaces/prometheus`.
- Docs: `features-brainstorm.md`, `best-of-both.md`, `review/implementation-review.md`,
  `multi-account-and-backends.md`, `browser-design.md`, `source-repositories.md`.

---

## Scoring model

| Axis | Meaning |
|------|---------|
| Impact | User-visible value or correctness/safety gain |
| Effort | Estimated work on the package-owned boundary (not vendored source) |
| Risk | Breakage surface, security, or upstream-coupling |
| ROI | Impact / Effort, gated by Risk |

Ranking is **impact-weighted**: cheap correctness fixes outrank larger features even when the
feature is valuable.

---

## Tier 1 — Correctness & safety (cheapest, highest certainty)

### Production hardening: Pi turn metadata adapter — **Implemented**

**Problem.** The first authenticated live smoke reached a healthy daemon but Pi's standard
Responses payload lacked the native Codex turn/environment fields required for browser-session
replay.

**Implemented design.** `backends/openai/turn/request.ts` adds the daemon's upstream-tested
canonical metadata after Pi conversion: stable session/thread identity, active-user-entry turn
identity, matching prompt-cache key, deterministic server-owned item IDs, and a read-only
cwd-bound environment. See [backends/openai/turn/request](../backends/openai/turn/request.md).

**Acceptance:** package tests and direct upstream/vendored parser checks pass. Authenticated live
smokes pass for light/high routes, and two-turn continuity preserves browser-session replay.

---

### R1. Fix model metadata to the daemon's single-immutable-effort routes — **Implemented**

**Problem.** `src/backends/openai/models.ts` names `chatgpt-web/high` "GPT-5.6 Sol" and
`chatgpt-web/luna` "GPT-5.6 Luna" with multi-level thinking maps. The vendored daemon catalog
(`vendor/.../src/chatgpt-web-models.ts`) defines **one immutable effort per route**:
`chatgpt-web/high` → `codexEffort/adapterEffort: "high"`, `chatgpt-web/luna` → low effort, plus an
`extra-high` route. Sending a different reasoning effort would be rejected or silently mis-tuned on
every inference. This is a real correctness bug, not a naming nit.

**Evidence.** `review/implementation-review.md` ("Resolved: fixed-effort model metadata"); daemon
`chatgpt-web-models.ts:155-205` (route → immutable effort), `model-catalog.ts:28-42` (reasoning level
per effort).

**Implemented design.**
- `turn/model.ts` is the authoritative route catalog: `light`, `medium`, `high`, `extra-high`,
  `pro`, and `luna`, each with a daemon display name, one immutable Pi reasoning level, and a
  context window from the daemon catalog.
- `models.ts` sets every thinking level to `null` except the route's single supported level, so Pi
  never sends an unsupported reasoning effort.
- `provider.ts` builds models per account from cached `solAvailable`/`proAvailable` capabilities.
- The daemon does not define a model output ceiling (its auto-compaction, browser-message, and
  composer limits have different meanings), so `maxTokens` uses a documented conservative `16_384`
  output ceiling rather than the previous speculative `90_000`/`128_000`.

**Effort:** Low. **Impact:** High (correctness on the primary path). **Risk:** Low.

**Acceptance:** every registered model exposes exactly one supported thinking level mapping to the
route the daemon accepts; names match the daemon catalog; context windows are route-faithful;
`maxTokens` is the documented conservative ceiling.

---

### R2. Add the `autoLogin` opt-out flag — **Implemented**

**Problem.** `daemon-ownership-brainstorm.md` Q2 recommended lazy login be **opt-out via a flag**.
Before this milestone, every first use of a ChatGPT Web model opened the isolated Chrome login
window with no way to suppress it. Users who prefer to trigger login manually (via
`internet_daemon login`) or who load Pi headless could not opt out.

**Evidence.** `daemon-ownership-brainstorm.md` §6 (Recommendation C), risk table "lazy trigger +
`autoLogin` opt-out flag"; `src/hooks.ts` `before_provider_request` calls `manager.ensureReady()`.

**Implemented design.**
- `settings.ts` persists `{ autoLogin: true }` under `$PI_AGENT_DIR/internet/settings.json` with
  atomic `0600` writes.
- `internet_settings` reads settings or toggles `autoLogin`.
- In `hooks.ts`, when the account lacks verified login and `autoLogin` is false, the hook does **not**
  call `ensureReady`; it suppresses Chrome and notifies interactive users to run
  `internet_daemon login`. It returns a fixed content-free request with a reserved unknown local
  route so Pi's swallowing hook dispatcher cannot forward the original unprepared request.

**Effort:** Low. **Impact:** Medium (UX + headless safety). **Risk:** Low.

**Acceptance:** with `autoLogin:false`, no Chrome window opens automatically and interactive users get
an actionable message; `internet_daemon login` still works.

---

### R2b. Conversation continuity + unobtrusive headed browser — **Refined target**

**Problem.** Consecutive `--print` invocations appear to start fresh: each is a new process/session,
so the daemon receives only the current message and cannot replay history. Within one session, the
daemon opened a fresh Temporary Chat per turn, so continuity relied entirely on history replay.

**Evidence.** `implementation-plan-conversation-continuity.md`; daemon
`src/adapters/chatgpt-web/browser-worker.ts` (`pageForNewTurn` → fresh Temporary Chat) and
`src/adapters/chatgpt-web/prompt.ts` (`compileChatGptWebPrompt` replays history); Prometheus
`electron/provider-senders/chatgpt.cjs` (types into the already-open page for in-browser continuity).

**Refined design.** Keep the stable Pi session thread ID and full-history replay as the correctness
fallback, but also keep **one ChatGPT conversation tab per Pi session ID** so ChatGPT retains context
in the chat. The daemon owns a **~1-minute idle shutdown** (no new request/message for 60 s) and
launches headed Chrome at a **small top-left window**. Separate CLI runs continue by resuming the Pi
session (`--continue`, `--resume`, or `--session`) rather than a duplicate package session database.

**Effort:** Medium. **Impact:** High (removes repeated Chrome startup and keeps in-chat context while
preserving browser-check reliability). **Risk:** Low–Medium (long-lived SPA DOM).

**Acceptance:** the same Pi session reuses one ChatGPT conversation and a remembered value stays
visible in the chat; the tab closes ~1 minute after the last request; a new Pi session starts a fresh
conversation; the read-only warning no longer repeats in browser-only turns.

---

## Tier 2 — New capability (fills the real Pi gap)

### R3. `internet_search` + `internet_fetch` (web access) — **Implemented**

**Problem.** Pi has **no built-in web search/browse/fetch tools** — only UI utilities. This is the
largest functional gap for agents.

**Evidence.** `features-brainstorm.md` §1–§4. Source review found that daemon `server.ts:549`
(`POST /v1/alpha/search`) is a native Codex bearer-token passthrough, not an authenticated
browser-only search API. The parsed synthetic sidecar configuration has no executor in the vendored
snapshot, so neither path is safe or complete for this package.

**Implemented design.**
- `internet_search(query, limit)` uses one explicit, keyless public RSS search transport and returns
  bounded `{ title, url, snippet }` records.
- `internet_fetch(url)` uses the shared public-web boundary: an allowlist of globally routable public
  unicast IPv4/IPv6 resolved via DNS, per-redirect revalidation, an absolute deadline across DNS,
  redirects, headers, and body consumption, content-type/encoding validation, response-size limits,
  and body cancellation on every rejection.
- Both tools are read-only and require no interactive approval.
- The daemon control token remains scoped to `/admin/*`; it is never forwarded upstream.

**Effort:** Low–Medium. **Impact:** High (gives Pi native live web). **Risk:** Medium (the keyless
RSS transport can change or throttle; errors remain explicit with no hidden fallback).

**Acceptance:** `internet_search` returns real sources without an API key; `internet_fetch` returns
readable text; read-only actions are not gated behind interactive approval; non-public or oversized
fetch targets are rejected and the response body is cancelled.

---

### R4. `internet_doctor` — failure diagnostics — **Implemented**

**Problem.** When a turn fails (proxy, config, chrome, login), the agent has no way to diagnose it
from within Pi.

**Evidence.** daemon `cli.ts:229,372` (`doctor` command), `doctor.ts` (`runDoctor` →
`DoctorReport`, `formatDoctorReport` with `--json`).

**Implemented design.** See [daemon/doctor](../daemon/doctor.md).
- Run `[launcher, --home, configDir, doctor, --json]` with `execFile` (no shell), caller
  cancellation, a 45-second timeout, and a 1 MiB output limit.
- Strictly validate the typed report and return valid failing diagnostics despite the daemon's
  documented exit status 1 when its aggregate is false.
- Preserve all checks with explicit Pi/upstream scope, while computing Pi readiness from
  config/browser/login/proxy checks rather than Codex CLI and OS-service checks.
- Keep the read-only Pi tool separate from the process/validation boundary; command, runtime,
  timeout, cancellation, and malformed-report failures use `daemon_doctor_failed`.

**Effort:** Low. **Impact:** Medium (post-setup UX). **Risk:** Low.

**Acceptance:** `internet_doctor` returns structured check results and a human-readable summary;
execution/malformed-report failures raise a typed, non-retryable error.

---

### R4b. Full harness / local file access (`@file` + local tools) — **Implemented**

**Problem.** `@file` references are sent as attachment names only; the model cannot read local file
contents. The daemon runs in `browser-only` mode, so the browser session has no local tool access.

**Evidence.** [`daemon/harness`](../daemon/harness.md) and
[`backends/openai/turn/files`](../backends/openai/turn/files.md); daemon `src/config.ts` (`RuntimeMode`,
`localToolsEnabled`), `src/setup.ts` (`connectorSetupRequired`), `src/adapters/chatgpt-web/turn-broker.ts`
and `mcp-server.ts` (Full-mode local tools); Prometheus `src/mcp-server.js` (`readFileContents` inline
`@file` expansion).

**Implemented design.** Add account-scoped `internet_harness` status/enable/disable/restart. Full
mode writes validated tunnel settings, copies runtime-key bytes into private `0600` storage, starts
the daemon broker, and invokes the vendored tunnel/MCP path. Safe static `@file` expansion works in
both modes with workspace confinement and count/size/text limits.

**Effort:** Medium–High. **Impact:** High (real local file/tool access). **Risk:** Medium–High (Full
mode grants local tool access; must stay approval-gated and loopback-only).

**Acceptance:** in browser-only mode, `@README.md` inlines contents and the model can summarize them;
in full mode, the model can read/edit a local file via bridged `codex_*` tools with approval prompts.

---

## Tier 3 — Robustness of the core path

### R5. Hybrid capture (network interception primary + DOM fallback)

**Problem.** The daemon uses DOM parsing as its capture method. The rendered UI is the least stable
contract (cosmetic, silent changes); the wire (SSE/JSON) is the most stable and richer (reasoning,
tool calls, usage, citations).

**Evidence.** `best-of-both.md` §1–§2 (the endpoint-vs-UI argument and hybrid design); Prometheus
`src/provider-catalog.cjs` + `src/automation/*.cjs` contain working per-provider interceptors and
parsers that can be ported; daemon `src/adapters/chatgpt-web/browser-worker.ts` is the current DOM
path.

**Design.**
- In the vendored daemon's browser worker, add an interception layer as the primary capture; keep DOM
  parsing as the fallback on `endpointChanged | opaqueFormat | transportChanged`.
- Port the capture/parse logic from Prometheus where it maps cleanly; keep the hybrid in one place.

**Effort:** Medium–High. **Impact:** High (protects the core model path against ChatGPT UI churn).
**Risk:** Medium (touches vendored daemon internals; endpoint obfuscation/auth).

**Acceptance:** interception is the primary path; DOM fallback preserves answers when interception
fails; no double-parsing or duplicate parser.

---

## Tier 4 — Differentiators (larger, later)

### R6. Multi-backend seam (Claude/Gemini) + Fusion "ask all"

**Problem.** Single ChatGPT backend today. Multi-backend enables ensemble reasoning.

**Evidence.** `best-of-both.md` §3–§5 (fusion), `multi-account-and-backends.md`.

**Design.** Introduce an explicit backend interface, add API backends, then `internet_ask_all` fan-out
+ synthesis (heuristic merge first, strongest-model opt-in).

**Effort:** High. **Impact:** High (differentiator). **Risk:** Medium–High. **ROI:** Low now.

**Acceptance:** N backends run concurrently; fused answer with attribution and disagreement list.

### R7. Full-mode tool bridge (`codex_tool_call`/`exec`/`apply_patch`)

**Problem.** Native Codex tools not exposed to Pi.

**Evidence.** `features-brainstorm.md` §2.5/§3 (P4, needs approval gate); `tool_call` approval hook
already exists in `hooks.ts`.

**Design.** Map bridge tools through the existing approval gate.

**Effort:** High. **Impact:** High. **Risk:** High. **ROI:** Low now. **Acceptance:** every bridged
tool requires interactive approval.

---

## Recommendation

R1–R4 are implemented: correctness/safety fixes, web access, and account diagnostics. **R5** is the
top medium-effort investment next because it hardens the primary path. **R6/R7** are later, larger
bets once the seam and approval surface are proven.

## Open questions

- Should a future daemon-native search replace the public RSS transport? Only after the daemon owns
  a legitimate upstream credential or a complete browser sidecar executor; never reuse the admin
  control token.
- Should hybrid capture live in the vendored daemon or be overridden at the Pi boundary? Prefer the
  daemon so DOM/SSE remain one owned path.
