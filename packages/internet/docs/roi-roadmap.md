# Internet — ROI Roadmap

Grounded, prioritized features for `@tsuuanmi/pi-internet` after the owned-daemon MVP. Each item
lists the evidence (docs + repo source), design, effort, impact, risk, and acceptance criteria so
the tradeoff is explicit before any code.

> Status: **R1–R3 implemented.** R4–R7 remain proposals.

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

### R1. Fix model metadata to the daemon's single-immutable-effort routes — **Implemented**

**Problem.** `src/backends/openai/models.ts` names `chatgpt-web/high` "GPT-5.6 Sol" and
`chatgpt-web/luna` "GPT-5.6 Luna" with multi-level thinking maps. The vendored daemon catalog
(`vendor/.../src/chatgpt-web-models.ts`) defines **one immutable effort per route**:
`chatgpt-web/high` → `codexEffort/adapterEffort: "high"`, `chatgpt-web/luna` → low effort, plus an
`extra-high` route. Sending a different reasoning effort would be rejected or silently mis-tuned on
every inference. This is a real correctness bug, not a naming nit.

**Evidence.** `review/implementation-review.md` (deferred item); daemon `chatgpt-web-models.ts:155-205`
(route → immutable effort), `model-catalog.ts:28-42` (reasoning level per effort).

**Design.**
- Read the daemon's `chatgpt-web-models.ts` and `model-catalog.ts`.
- For each registered Pi model set exactly one `thinkingLevelMap` entry reflecting the route's
  immutable effort, and the daemon's display name.
- Source or document `maxTokens` from `resolveChatGptWebContextLimits` / transport limits instead of
  the current speculative `90_000`/`128_000` (review deferred item #2).

**Effort:** Low. **Impact:** High (correctness on the primary path). **Risk:** Low.

**Acceptance:** every registered model's reasoning maps to a route the daemon accepts; names match
the daemon catalog; `maxTokens` is sourced or documented.

---

### R2. Add the `autoLogin` opt-out flag — **Implemented**

**Problem.** `daemon-ownership-brainstorm.md` Q2 recommended lazy login be **opt-out via a flag**.
The committed implementation has the **lazy trigger** but no opt-out: every first use of a ChatGPT
Web model opens the isolated Chrome login window. Users who prefer to trigger login manually (via
`internet_daemon login`) or who load Pi headless cannot suppress it.

**Evidence.** `daemon-ownership-brainstorm.md` §6 (Recommendation C), risk table "lazy trigger +
`autoLogin` opt-out flag"; `src/hooks.ts` `before_provider_request` calls `manager.ensureReady()`.

**Design.**
- Add a small config surface (package settings) e.g. `autoLogin: boolean` (default true).
- In `hooks.ts`, when the account lacks verified login and `autoLogin` is false, do **not** call
  `ensureReady`; surface a clear error telling the agent to run `internet_daemon login`.

**Effort:** Low. **Impact:** Medium (UX + headless safety). **Risk:** Low.

**Acceptance:** with `autoLogin:false`, no Chrome window opens automatically and the first request
fails with an actionable message; `internet_daemon login` still works.

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
- `internet_fetch(url)` uses the shared public-web boundary with scheme/credential checks, DNS-based
  private/reserved-address blocking, per-redirect validation, timeout, content-type validation, and
  response-size limits.
- Both tools are read-only and require no interactive approval.
- The daemon control token remains scoped to `/admin/*`; it is never forwarded upstream.

**Effort:** Low–Medium. **Impact:** High (gives Pi native live web). **Risk:** Medium (search auth
surface; sidecar availability depends on account/capability).

**Acceptance:** `internet_search` returns real sources without an API key; `internet_fetch` returns
readable text; read-only actions are not gated behind interactive approval.

---

### R4. `internet_doctor` — failure diagnostics

**Problem.** When a turn fails (proxy, config, chrome, login), the agent has no way to diagnose it
from within Pi.

**Evidence.** daemon `cli.ts:229,372` (`doctor` command), `doctor.ts` (`runDoctor` →
`DoctorReport`, `formatDoctorReport` with `--json`).

**Design.**
- Run the bundled daemon `doctor --json` as a child process (reusing `manager` spawn conventions).
- Parse `DoctorReport` and surface it as `internet_doctor`, returning structured checks
  (proxy/config/browser-host/chrome/login/codex/service/tunnel) + pass/fail.

**Effort:** Low. **Impact:** Medium (post-setup UX). **Risk:** Low.

**Acceptance:** `internet_doctor` returns structured check results and a human-readable summary.

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

Do **Tier 1 (R1 + R2) + R3** as the next milestone: cheap correctness/safety wins plus the highest
new-value capability (web access), all reusing the already-vendored daemon surfaces. **R5** is the
top medium-effort investment after that because it hardens the primary path. **R6/R7** are later,
larger bets once the seam and approval surface are proven.

## Open questions

- Should a future daemon-native search replace the public RSS transport? Only after the daemon owns
  a legitimate upstream credential or a complete browser sidecar executor; never reuse the admin
  control token.
- Should hybrid capture live in the vendored daemon or be overridden at the Pi boundary? Prefer the
  daemon so DOM/SSE remain one owned path.
- Do we fix model metadata and `maxTokens` together (they are coupled in `models.ts`)?
