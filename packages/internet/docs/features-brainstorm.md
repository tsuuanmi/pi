# Internet — Feature Brainstorm

This document brainstorms the features the `internet` package should add, grounded in what the
codex-chatgpt-web daemon already provides and what Pi currently lacks. It builds on
[review-and-brainstorm.md](review-and-brainstorm.md) (MVP = model routing) and
[multi-account-and-backends.md](multi-account-and-backends.md) (multi-account + Claude/Gemini).

Status: **proposal.** Nothing is implemented.

---

## 1. What Pi is missing (the gap)

Pi has **no built-in web search, browse, or fetch tools** — only UI utilities (`open-browser.ts`,
`model-search.ts`). The `internet` package can fill this gap by exposing the daemon's web-search
capability and adding a native fetch/browse tool. This is the highest-value feature beyond model
routing.

The daemon already has:
- `POST /v1/alpha/search` — native Codex search passthrough (`src/server.ts`).
- A **web-search sidecar** (`src/web-search/synthetic-tool.ts`) that executes `web_search` calls via
  a gpt-mini model and returns sources.
- `web_search_call_begin` / `web_search_call_end` lifecycle events surfaced in the bridge.

---

## 2. Feature list (grouped)

### 2.1 Model routing (MVP — already agreed)
- Register the daemon as a Pi `openai-responses` provider (`gpt-5.6-sol` / `gpt-5.6-luna`).
- `internet_status` (daemon health/turns), `internet_compact` (context summarization), HUD.

### 2.2 Web search (new — fills the Pi gap)
- **`internet_search`** — a Pi tool that calls the daemon's `/v1/alpha/search` (or the web-search
  sidecar) and returns results + sources. This gives Pi agents native web search without a third-party
  API key.
- **`internet_fetch`** — fetch a URL and return its text/markdown (via the daemon or a direct
  fetch). Useful for reading pages found by search.
- **`internet_browse`** — (post-MVP) drive the daemon's browser to a URL and return the rendered
  content, for JS-heavy pages.

### 2.3 Account & backend management (next)
- `internet_accounts`, `internet_account_add`, `internet_account_enable/disable` (from
  multi-account-and-backends.md).
- Backend seam for Claude / Gemini (future).

### 2.4 Daemon lifecycle (post-MVP)
- **`internet_daemon_start` / `internet_daemon_stop`** — manage the codex-chatgpt-web daemon
  lifecycle (start on demand, stop on Pi shutdown).
- **`internet_doctor`** — surface the daemon's doctor checks (proxy, config, browser-host, chrome,
  login, codex, service, tunnel) as a Pi tool so the agent can diagnose why a turn failed.

### 2.5 Full-mode tool bridge (post-MVP)
- `codex_tool_call`, `codex_exec`, `codex_write_stdin`, `codex_apply_patch` wired through the
  `tool_call` approval hook.

---

## 3. Prioritization

| Priority | Feature | Why |
|----------|---------|-----|
| P0 (MVP) | Model routing + `internet_status` + `internet_compact` + HUD | The agreed MVP; makes ChatGPT Web usable. |
| P1 | **`internet_search` + `internet_fetch`** | Fills a real Pi gap (no web tools); high value, low effort via the daemon. |
| P2 | Multi-account + backend seam | Enables multiple ChatGPT accounts; future Claude/Gemini. |
| P3 | Daemon lifecycle + `internet_doctor` | Better UX; diagnose failures. |
| P4 | Full-mode tool bridge | Powerful but needs the approval gate; highest risk. |

---

## 4. Web search design sketch

```ts
// src/tools/search.ts
import { T } from "@sinclair/typebox";

const searchParams = T.Object({
  query: T.String({ minLength: 1 }),
  limit: T.Optional(T.Integer({ minimum: 1, maximum: 20, default: 5 })),
});

export function registerSearchTool(host: InternetToolHost): void {
  host.registerTool({
    name: "internet_search",
    description: "Search the web and return results with sources.",
    params: searchParams,
    details: { destructive: false, openWorld: true },
    async execute(params, ctx) {
      // POST /v1/alpha/search via the daemon client
      return daemonSearch(ctx, params.query, params.limit);
    },
  });
}
```

The daemon's `/v1/alpha/search` requires a Bearer token (it forwards to the native Codex backend),
so `internet_search` uses the daemon's control token — unlike `/v1/responses` which is unauthenticated.

---

## 5. Risks and open questions

| Risk / question | Note |
|-----------------|------|
| `/v1/alpha/search` needs the control token | Unlike `/v1/responses`, search forwards to the native backend and requires auth. Confirm the exact header. |
| Web-search sidecar availability | The sidecar runs only when Codex enables `web_search`; `internet_search` may need to enable it or fall back to `/v1/alpha/search`. |
| Fetch/browse scope | `internet_fetch` should be read-only and rate-limited; `internet_browse` (browser) is heavier and post-MVP. |
| Daemon lifecycle ownership | Starting/stopping the daemon from Pi must not conflict with a user-managed daemon. Make it opt-in. |
| Doctor checks | The daemon's doctor is a CLI command; exposing it as a Pi tool requires parsing its output. |

---

## 6. Bottom line

The MVP is model routing (agreed). The **next highest-value feature is web search + fetch**, because
Pi currently has no web tools and the daemon already provides the search capability. After that,
multi-account, daemon lifecycle/doctor, and the full-mode tool bridge round out the package.
