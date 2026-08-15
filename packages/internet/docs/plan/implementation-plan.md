# Internet — Implementation Plan (ROI-Sorted)

A detailed, execution-ready plan synthesized from the brainstorm docs and roadmap. Every item is a
work package with a clear goal, scope, evidence, effort/impact/risk, and acceptance criteria, sorted
by ROI (impact ÷ effort, gated by risk). This supersedes the older R1–R7 sequencing in
`roi-roadmap.md` by folding in the newer brainstorm outcomes (macOS, multi-account sign-in, the
session model, and Council-via-orchestrator).

> Status: **plan.** R1–R4 are already implemented. The remaining work is listed by ROI, from the
> must-do next step (macOS) through the long-horizon differentiator (Council).

Sources (brainstorm docs this plan consolidates):
- `runtime-architecture-brainstorm.md` — decided runtime (vendor + embed Bun, system Chrome; no Electron).
- `mcp-tunnel-broker.md` — Full-harness option (turn broker, MCP server, tunnel).
- `multi-account-signin.md` — multi-account sign-in and credential-automation analysis.
- `council-via-orchestrator.md` — Council vs. current stack, session model, orchestrator as dependency.
- `review/architecture-review.md` — the five principles (Pi provider, best-of-three, runtime, Council-future, macOS+Linux).

---

## Scoring model

| Axis | Meaning |
|------|---------|
| Impact | User-visible value or correctness/safety gain |
| Effort | Estimated work on the package-owned boundary (not vendored source unless noted) |
| Risk | Breakage surface, security, or upstream-coupling |
| ROI | Impact / Effort, gated by Risk |

Ranking is impact-weighted: cheap, high-certainty work outranks larger bets.

---

## Tier 0 — Done (R1–R4)

Already implemented and stable; not part of the remaining plan:
- R1 fixed-effort model metadata, R2 `autoLogin` opt-out, R2b conversation continuity, R3 web
  search/fetch, R4 `internet_doctor`, R4b Full harness + `@file`.

These are the foundation the rest of the plan builds on. See `roi-roadmap.md` for the details.

---

## Tier 1 — macOS support (required, highest certainty)

**Goal.** Both Linux and macOS are required targets. Linux is done; make macOS a first-class,
CI-verified artifact.

**Evidence.** `runtime-architecture-brainstorm.md` §3.2; `architecture-review.md` §5;
`src/daemon/runtime.ts` hard-gates Linux; `scripts/build-runtime-bundle.ts` is already
platform-agnostic; `src/config.ts` `defaultChromeExecutable()` already returns the darwin path.

**Scope.**
1. Relax `src/daemon/runtime.ts` to accept `darwin` and validate the manifest against the running
   platform (drop the hard `platform !== "linux"` throw).
2. Build the runtime on macOS (or cross-build) so `dist/daemon/runtime/` contains a darwin artifact.
3. Confirm **system Chrome via Playwright** on macOS: headed login and inference against the darwin
   Chrome path.
4. Add a macOS CI build/smoke lane so the darwin artifact is verified, not just produced.
5. Update docs from "Linux-first" to "Linux and macOS".

**Effort:** Medium. **Impact:** High (closes the stated platform goal). **Risk:** Low (daemon already
handles darwin; the work is the package boundary + CI).

**Acceptance:** `internet_daemon login` + inference work on macOS against system Chrome; the darwin
runtime artifact builds and passes smoke in CI; docs state Linux and macOS.

**ROI:** **Top.** Cheap, high-certainty, and directly required.

---

## Tier 2 — R5 hybrid capture (protects the core path)

**Goal.** Make the primary model path robust against ChatGPT UI churn by capturing the wire
(SSE/JSON) instead of only parsing the rendered DOM.

**Evidence.** `runtime-architecture-brainstorm.md` §3.3; `roi-roadmap.md` R5; Prometheus
`src/provider-catalog.cjs` + `src/automation/*.cjs` (working per-provider interceptors/parsers);
daemon `src/adapters/chatgpt-web/browser-worker.ts` (current DOM path).

**Scope.**
1. In the vendored daemon's browser worker, add an interception layer as the **primary** capture;
   keep DOM parsing as the **fallback** on `endpointChanged | opaqueFormat | transportChanged`.
2. Port the capture/parse logic from Prometheus where it maps cleanly; keep the hybrid in one place
   (the daemon), so DOM/SSE stay one owned path.
3. No double-parsing, no duplicate parser.

**Effort:** Medium–High. **Impact:** High. **Risk:** Medium (touches vendored daemon internals;
endpoint obfuscation/auth).

**Acceptance:** interception is primary; DOM fallback preserves answers when interception fails;
no duplicate parser.

**ROI:** High. Hardens the single most important surface (correct ChatGPT capture).

---

## Tier 3 — Multi-account sign-in UX (enables the team model)

**Goal.** Make setting up multiple accounts practical. Multi-agent requires multiple accounts
(3 ChatGPT + 1 Gemini + 1 Claude); raw `account|password|2fa` automation is not reliable, so the
plan is one-time manual sign-in per account plus session reuse.

**Evidence.** `multi-account-signin.md`; `src/accounts/registry.ts` (already supports a list of
accounts with isolated daemons/ports); vendored `browser-login.ts` (manual Chrome sign-in +
storage-state capture).

**Scope (in ROI order):**
1. **Guided multi-account login.** A `login` flow that walks the user through all enabled accounts
   in one pass (instead of discovering each separately).
2. **Session import/export.** Let the user reuse an existing signed-in session (a storage-state
   file) for an account instead of re-signing in; validate it like a fresh login.
3. **TOTP-assisted automation (opt-in, low priority).** Accept `account|password|totp-secret` for
   plain email/password + TOTP accounts, best-effort, never the default. **Explicitly out:** raw
   `account|password|2fa` as default, plaintext credential storage, push/SSO automation.

**Effort:** Medium (1–2), High (3). **Impact:** High (unlocks multi-agent). **Risk:** Medium
(sign-in touches browser automation; keep it opt-in and best-effort).

**Acceptance:** a user can set up N ChatGPT accounts in one guided pass; can import an existing
session; TOTP flow (if built) works only for plain email/password + TOTP and is opt-in.

**ROI:** High. Required enabler for the team model; guided login + import are cheap wins.

---

## Tier 4 — R6 multi-backend seam + Fusion "ask all"

**Goal.** Support multiple providers (ChatGPT, Gemini, Claude), each with multiple accounts, then
fan out to an ensemble.

**Evidence.** `council-via-orchestrator.md` (multi-provider × multi-account team model);
`roi-roadmap.md` R6; `multi-account-and-backends.md`.

**Scope.**
1. Introduce an explicit **backend interface** behind `src/backends/` (ChatGPT daemon is the first
   implementation; add API backends for Gemini/Claude).
2. Each backend registers Pi providers per account, using the **session model**: one chat session
   per provider per Pi session.
3. `internet_ask_all` fan-out + synthesis (heuristic merge first, strongest-model opt-in).

**Effort:** High. **Impact:** High (differentiator). **Risk:** Medium–High. **ROI:** Medium now.

**Acceptance:** N backends run concurrently; each account is an isolated provider; fused answer with
attribution and a disagreement list.

---

## Tier 5 — R7 full-mode tool bridge + Council-via-orchestrator (long-horizon)

**Goal.** Expose local tools (`codex_tool_call`/`exec`/`apply_patch`) through the approval gate, then
build Council-like multi-agent on the current stack (orchestrator + internet).

**Evidence.** `mcp-tunnel-broker.md` (Full harness is a desired option); `council-via-orchestrator.md`
(orchestrator as a model-agnostic dependency; session model; one daemon per account/port).

**Scope (sequenced):**
1. **R7 tool bridge.** Map bridged `codex_*` tools through the existing `tool_call` approval hook.
   Every bridged tool requires interactive approval. High effort, high risk, approval-gated.
2. **Multiple per-account sessions.** Extend the daemon/package to run **one daemon per account on
   its own port**, each bound to one Pi session → one provider chat ID. This is the missing
   foundation for a team.
3. **Orchestrator as dependency.** Add `@tsuuanmi/pi-orchestrator` and wire it as the
   **model-agnostic coordinator** over those plain Pi agents (task DAGs, agent assignment, decision
   gates, consensus, checkpoints, subagent manager).
4. **Session model.** One Pi session links to **one chat per provider** (1 ChatGPT + 1 Claude +
   1 Gemini = 3 chats on 1 Pi session); additional same-provider sessions live in separate
   agent/subagent sessions. The Pi session is the **lead session**; members run in isolated or
   subagent sessions.
5. **`<COUNCIL_ACTIONS>` protocol** (optional) as a thin adapter over the per-agent provider chat
   sessions — not a re-implementation of the orchestrator.

**Effort:** High. **Impact:** High (differentiator). **Risk:** High. **ROI:** Low now.

**Acceptance:** every bridged tool is approval-gated; N per-account sessions run on distinct ports;
the orchestrator coordinates heterogeneous agents (ChatGPT/Gemini/Claude) without knowing the model.

---

## Recommendation (what to build, in order)

| Order | Work | ROI | When |
|-------|------|-----|------|
| 1 | **macOS support** | Top | Now (required, cheap, high certainty) |
| 2 | **R5 hybrid capture** | High | Next (protects the core path) |
| 3 | **Multi-account sign-in UX** (guided login + session import) | High | After R5 (enables the team model) |
| 4 | **R6 multi-backend seam + Fusion** | Medium | Later |
| 5 | **R7 tool bridge + Council-via-orchestrator** | Low now | Long-horizon |

**Rationale.** macOS is the cheapest, highest-certainty required step and closes the stated platform
goal. R5 hardens the single most important surface (ChatGPT capture). Multi-account sign-in is the
enabler for the team model but only matters once the core path and platform are solid. R6/R7 are
larger differentiators to reach after the seam, approval surface, and per-account session model are
proven.

## Open questions

- Cross-build vs. build-on-host for the darwin artifact? Build-on-host is simplest; cross-build needs
  a Bun cross-compile story.
- Should hybrid capture ship inside the vendored daemon (preferred) or be overridden at the Pi
  boundary? Prefer the daemon so DOM/SSE stay one owned path.
- When is a TOTP-assisted login worth the fragility? Only after guided login + session import are
  proven and a real user needs it.
- Should the `<COUNCIL_ACTIONS>` protocol be adopted, or is the orchestrator's own action protocol
  enough? Decide when the per-account session model is built.
