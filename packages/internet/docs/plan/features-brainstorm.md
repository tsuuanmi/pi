# Internet — Feature Brainstorm

This document brainstorms the features the `internet` package should add, grounded in what the
codex-chatgpt-web daemon already provides and what Pi currently lacks. It builds on
[review/review-and-brainstorm](../review/review-and-brainstorm.md) (MVP = model routing) and
[multi-account-and-backends.md](multi-account-and-backends.md) (multi-account + Claude/Gemini).

Status: **partially implemented.** Model routing, lifecycle, multi-account management, public web
search/fetch, and account diagnostics are implemented; remaining items are proposals.

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

### 2.3 Account management (implemented) and backend seam (future)
- `internet_accounts`, `internet_account_add`, and `internet_account_set_enabled` manage isolated
  ChatGPT Web daemon accounts.
- Backend seam for Claude / Gemini remains future work.

### 2.4 Daemon lifecycle and diagnostics (implemented)
- **`internet_daemon`** — login, start, stop, restart, or inspect package-owned daemon processes;
  owned processes stop on Pi shutdown.
- **`internet_doctor`** — run bounded account-scoped daemon checks and return validated structured
  diagnostics. Checks retain explicit Pi/upstream scope so native Codex-route and OS-service
  requirements do not falsely fail Pi readiness.

### 2.5 Full-mode tool bridge (post-MVP)
- `codex_tool_call`, `codex_exec`, `codex_write_stdin`, `codex_apply_patch` wired through the
  `tool_call` approval hook.

---

## 3. Prioritization

| Priority | Feature | Why |
|----------|---------|-----|
| P0 (MVP) | Model routing + `internet_status` + `internet_compact` + HUD | The agreed MVP; makes ChatGPT Web usable. |
| P1 (done) | **`internet_search` + `internet_fetch`** | Fills a real Pi gap through a safe package-owned public web boundary. |
| P2 (done) | Multi-account + daemon lifecycle + `internet_doctor` | Isolated accounts, owned processes, and actionable diagnostics. |
| P3 | Hybrid capture + backend seam/fusion | Harden ChatGPT capture, then add Claude/Gemini orchestration. |
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
| Doctor checks | Implemented adapter validates CLI output and separates Pi readiness from upstream-only checks. |

---

## 6. Bottom line

Model routing, lifecycle, account management, diagnostics, and safe public web search/fetch are
implemented. Hybrid capture is next, followed by the backend seam/fusion and full-mode tool bridge.
