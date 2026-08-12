# Internet — Feature Brainstorm

This document brainstorms the features the `internet` package should add, grounded in what the
codex-chatgpt-web daemon already provides and what Pi currently lacks. It builds on
[review-and-brainstorm.md](review-and-brainstorm.md) (MVP = model routing) and
[multi-account-and-backends.md](multi-account-and-backends.md) (multi-account + Claude/Gemini).

Status: **partially implemented.** Model routing, lifecycle, multi-account management, and public
web search/fetch are implemented; remaining items are proposals.

---

## 1. What Pi is missing (the gap)

Pi has no built-in public web search/fetch tools. The Internet package now fills that gap with a
safe package-owned transport. Source review showed that the daemon's `POST /v1/alpha/search` is a
native Codex credential passthrough and the vendored synthetic sidecar has no executor, so neither
is used by browser-only accounts.

---

## 2. Feature list (grouped)

### 2.1 Model routing (implemented)
- Register capability-scoped fixed-effort `chatgpt-web/*` routes through Pi's native
  `openai-responses` provider.
- `internet_status` (daemon health/turns), `internet_compact` (context summarization), HUD.

### 2.2 Web search (implemented — fills the Pi gap)
- **`internet_search`** — query a keyless public RSS endpoint and return source URLs/snippets.
- **`internet_fetch`** — fetch bounded readable public HTTP/HTTPS text with SSRF and redirect
  protections.
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
| P1 (done) | **`internet_search` + `internet_fetch`** | Fills a real Pi gap through a safe package-owned public web boundary. |
| P2 | Multi-account + backend seam | Enables multiple ChatGPT accounts; future Claude/Gemini. |
| P3 | Daemon lifecycle + `internet_doctor` | Better UX; diagnose failures. |
| P4 | Full-mode tool bridge | Powerful but needs the approval gate; highest risk. |

> **Grounded, detail-expanded version:** see [roi-roadmap.md](roi-roadmap.md), which ranks
> correctness (R1 model metadata, R2 `autoLogin` opt-out), web access (R3 search/fetch),
> diagnostics (R4), hybrid capture (R5), fusion (R6), and tool bridge (R7) by impact/effort/risk.

---

## 4. Web search implementation

Source review rejected the original daemon-client sketch: `/v1/alpha/search` forwards the incoming
native Codex Bearer token upstream, so using the daemon admin control token would both fail
authentication and disclose an administrative secret. The vendored synthetic sidecar is also not
executed by this snapshot.

The implemented `web/search.ts` uses one keyless public RSS search transport. `web/fetch.ts` owns the
shared HTTP security boundary: public HTTP/HTTPS only, DNS and redirect revalidation, private and
reserved address blocking, timeout, content-type checks, and response-size limits. Search/fetch are
read-only Pi tools and receive no daemon credential.

---

## 5. Risks and open questions

| Risk / question | Note |
|-----------------|------|
| Native daemon search | Deferred until the daemon owns a legitimate upstream credential or complete browser-side executor; never forward the admin token. |
| Fetch/browse scope | `internet_fetch` is bounded and read-only; rendered `internet_browse` remains heavier, post-MVP work. |
| Public search availability | The keyless RSS transport can change or throttle; errors remain explicit, with no hidden fallback. |
| Daemon lifecycle ownership | Implemented manager stops only processes owned by the Pi session. |
| Doctor checks | The daemon's doctor is a CLI command; exposing it as a Pi tool requires parsing its output. |

---

## 6. Bottom line

Model routing and safe public web search/fetch are implemented. The next candidates are daemon
doctor integration and hybrid capture, followed by multi-backend fusion and the full-mode tool
bridge.
