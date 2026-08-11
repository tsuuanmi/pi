# Internet — MVP Review & Brainstorm

This document reviews the `internet` design against the constraint that the **MVP must work with
current Pi as-is**, and it brainstorms the path forward. It also locks the scope: **ChatGPT Web via
the codex-chatgpt-web daemon is the MVP backend.** Codex and Claude Code are **explicitly deferred** —
they are future work, not part of this package's first milestone.

Status: **proposal**. This is a review of `architecture.md` / `layout.md` / `how-it-works.md` /
`pi-integration.md` with concrete recommendations to make the MVP smaller, more robust, and
cheaper to ship.

---

## 1. The review verdict

The four design docs are directionally correct, but the **wrapper architecture as currently framed
is heavier than the MVP needs.** The single biggest simplification comes from a fact about the
daemon's auth model (confirmed in `codex-chatgpt-web/src/server.ts`):

> **Only `/admin/*` routes require the control token. `POST /v1/responses` (and `/v1/responses/compact`)
> are unauthenticated; loopback binding is the only gate.**

This means `internet` does **not** need to build its own Responses SSE client or manage tokens for
the inference path. Pi already has a native `openai-responses` provider and stream handler
(`packages/ai/src/provider/openai/responses/`). The MVP can register the daemon as a provider and
let Pi's own provider machinery do the streaming.

---

## 2. MVP scope (locked)

### In scope
- **Model routing**: register the daemon as a `chatgpt-web` provider (`api: "openai-responses"`,
  `baseUrl: http://127.0.0.1:17841/v1`) so the agent can select `gpt-5.6-sol` / `gpt-5.6-luna`.
- **A thin tool surface**: `internet_status` (daemon health/turns) and `internet_compact`
  (context summarization). Keep it to the tools that add value without duplicating Pi's provider.
- **A skill** (`codex-turn`) that teaches the agent when/how to use the bridge.
- **HUD** status line (active turns, draining, mode).
- **One hook**: the `tool_call` approval gate for any destructive bridged action.
- **Lifecycle**: ensure the daemon is reachable; start it if configured; fail with a clear error
  otherwise.

### Explicitly out of scope (MVP)
- **Codex and Claude Code backends** — deferred. The provider/tool abstraction must not block on
  them.
- **Re-implementing the Responses SSE parser** — use Pi's `openai-responses` handler instead.
- **`codex_exec` / `codex_write_stdin` / `codex_apply_patch` native-tool bridging** into arbitrary
  turns. That is full-mode machinery with a human-approval gate; it belongs in a **post-MVP**
  milestone (see §7).
- **Editing `~/.codex/config.toml`** — that is the daemon's job, never the package's.

---

## 3. Review of each doc

### 3.1 `architecture.md`
- **Correct**: wrapper-over-daemon is the right call for MVP; reusing the bridge is far cheaper and
  safer than re-implementing.
- **Over-scoped**: §4 "Request path" and §5 "Full mode" describe the *full-mode tool bridge*. For
  MVP that is not needed — the agent gets ChatGPT Web as a **model**, not as a tool bridge. The
  tool bridge should move to the post-MVP milestone.
- **Recommendation**: reframe §4/§5 as "model routing (MVP)" vs "tool bridge (post-MVP)". The
  security model §6 stays, but the approval-gate bullet is about the post-MVP tool bridge, not the
  MVP model path.

### 3.2 `layout.md`
- **Over-built** for MVP. A `daemon/`, `turn/`, `compaction/`, `control/`, `tools/`, `skills/`,
  `tool/` split is a reasonable long-term tree, but the MVP needs far less:

```
src/
├── extension.ts       # registers provider + status/compact tools + HUD + skill
├── index.ts
├── daemon/
│   └── client.ts      # health + control-token admin helpers (drain/resume/shutdown)
├── provider/
│   └── register.ts    # pi.registerProvider("chatgpt-web", { api:"openai-responses", ... })
├── tools/
│   ├── status.ts      # internet_status
│   └── compact.ts     # internet_compact
├── skill.ts           # codex-turn SKILL.md glue
└── version.ts
```
- **Recommendation**: adopt this smaller layout for MVP; expand into the full tree only when the
  tool bridge lands.

### 3.3 `how-it-works.md`
- The SSE→tool-output mapping table (§2.1) is correct but **redundant with Pi's provider** in MVP.
  If the agent uses the bridge as a provider, Pi's own `openai-responses` handler produces the
  event stream; `internet` does not parse SSE itself.
- **Recommendation**: split "model routing (MVP)" from "tool bridge loop (post-MVP)". The MVP
  "how it works" is: register provider → agent selects ChatGPT Web model → Pi streams via the
  daemon. The post-MVP section documents the broker/token loop.

### 3.4 `pi-integration.md`
- **Mostly accurate**, but §4 "Model provider registration" is the **actual MVP centerpiece**, not
  optional. The docs list it as "optional; works fine as tool-only" — that is backwards. Provider
  routing **is** the MVP; the tools are the thin surface around it.
- The `tool_call` hook and subagent/team patterns are correct but belong to the post-MVP tool
  bridge.
- **Recommendation**: reorder so provider registration is §2 (core), tools/hooks are the secondary
  surface, and Codex/Claude Code are a clearly-labeled future section.

---

## 4. Key decisions for the MVP

1. **Use Pi's native `openai-responses` provider.** No custom SSE parser. The daemon already emits
   Responses SSE (`/v1/responses`), and Pi's `openai-responses` stream handler consumes exactly
   that. This removes the largest custom component from the MVP.

2. **No auth token on the inference path.** Because `/v1/responses` is unauthenticated on loopback,
   the provider needs no API key (or a placeholder). The control token is used **only** for the
   optional `/admin/*` control tools, read from a 0600 file.

3. **Daemon reachability gate.** `internet` must not silently run against a down daemon. On
   registration, check `/healthz`; if absent, surface a clear "start codex-chatgpt-web first" error
   (or offer to start it, config-gated).

4. **MVP = model + thin tools + skill + HUD + one approval hook.** Not the full tool bridge.

---

## 5. Provider config sketch

From `packages/pi/src/api/provider-types.ts`, `registerProvider` accepts:

```ts
import type { ExtensionAPI } from "@tsuuanmi/pi";

export function registerInternetProvider(pi: ExtensionAPI): void {
  pi.registerProvider("chatgpt-web", {
    name: "ChatGPT Web",
    api: "openai-responses",
    baseUrl: "http://127.0.0.1:17841/v1",
    authHeader: false, // loopback daemon; /v1/responses is unauthenticated
    models: [
      {
        id: "gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        reasoning: true,
        input: { text: true, image: true },
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256_000,
        maxTokens: 100_000,
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        reasoning: false,
        input: { text: true, image: true },
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256_000,
        maxTokens: 100_000,
      },
    ],
  });
}
```

This is the smallest thing that makes ChatGPT Web usable as a Pi model. Everything else builds on it.

---

## 6. Risks and open questions

| Risk / question | Note |
|-----------------|------|
| Pi's `openai-responses` handler must tolerate the daemon's exact SSE frame set. | Verify against `packages/ai/src/provider/openai/responses/index.ts`; the daemon emits standard `response.*` events plus `data: [DONE]`. Low risk but must be tested. |
| Daemon model IDs (`gpt-5.6-sol` / `gpt-5.6-luna`) vs Pi model routing. | Confirm the daemon's `routeChatGptWebRequest` accepts these slugs and that Pi passes them through unchanged. |
| Loopback-only binding means the provider only works on the same machine. | Acceptable for a local agent; document it. Remote Pi + daemon is out of scope. |
| Luna compaction is disabled by the daemon (rolling checkpoints). | `internet_compact` must not offer Luna compaction; mirror the daemon's guard. |
| Who starts the daemon? | MVP: require it to be running; auto-start is a config-gated follow-up. |
| Full-mode tool bridge needs the broker socket + approval gate. | Defer; it is the post-MVP milestone. |

---

## 7. Roadmap (post-MVP, in order)

1. **Provider model routing** — the MVP (this milestone).
2. **`internet_compact` + `internet_status` tools + HUD + skill** — thin surface (same milestone or
   immediately after).
3. **Full-mode tool bridge**: `codex_tool_call`, `codex_exec`, `codex_write_stdin`,
   `codex_apply_patch`, wired through the `tool_call` approval hook. Requires the broker socket and
   the per-turn trusted environment.
4. **Daemon lifecycle management** (start/stop on demand, config-gated).
5. **Codex backend** — extend the provider/tool abstraction to talk to Codex natively. Deferred.
6. **Claude Code backend** — same abstraction, `anthropic-messages` API. Deferred.

The provider + tool abstraction is the seam that keeps Codex / Claude Code future-proof without
shipping them now.

---

## 8. Bottom line

The MVP should be **small**: register the daemon as a Pi `openai-responses` provider, add a
`codex-turn` skill, a status tool, a compact tool, a HUD line, and one approval hook. Drop the
custom SSE parser and the full tool bridge from the first milestone. That gives working ChatGPT Web
routing in current Pi with minimal surface area, and it keeps the abstraction clean enough that
Codex and Claude Code can be added later without rework.
