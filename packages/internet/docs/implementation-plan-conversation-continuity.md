# Internet — Implementation Plan: Conversation Continuity and Browser Lifecycle

Source-grounded plan for keeping ChatGPT Web useful across turns without headless Chrome or a large
browser window reopening for every short Pi CLI run.

> Status: **refined target.** This document describes the intended design. The browser-lifecycle
> work shipped an initial version (five-minute idle keepalive, compact 900×700 headed window, fresh
> Temporary Chat per turn). The refinements below supersede those decisions: keep one ChatGPT
> conversation tab per Pi session ID, shrink the window into the top-left quarter, shorten the idle
> timeout, and stop emitting the noisy local-computer warning in browser-only mode.

## What source review established

### Logical continuity today is history replay, not an in-chat thread

`codex-chatgpt-web` intentionally opens a fresh Temporary Chat page per turn:

- `browser-worker.ts` uses one singleton browser worker, but `pageForNewTurn()` creates a new page.
- `prompt.ts` states that every turn opens a fresh Temporary Chat, then
  `compileChatGptWebPrompt()` serializes the complete accumulated Codex context into that page.

So the browser page is fresh, but the **model conversation** is replayed as the complete Pi message
history each turn. The package derives a stable `thread_id` from `sessionManager.getSessionId()` and
a new `turn_id` from the latest user entry.

### Why Chrome reopened for every short CLI command

The daemon already keeps a singleton browser alive while it runs. The package previously called
`manager.stopOwned()` on every Pi `session_shutdown`. A short `--print` invocation therefore did:

```text
start daemon → start headed Chrome → run turn → stop daemon → close Chrome
```

The next invocation repeated the entire sequence. The initial fix removed that eager stop and let the
daemon own idle shutdown.

### Why headless mode is not the fix

The authenticated ChatGPT/Cloudflare surface can reject or challenge automated headless sessions.
The package therefore keeps `headed: true`; reliability is more important than hiding the browser.

### Prometheus comparison

Prometheus keeps a persistent browser view and types into the currently open ChatGPT conversation.
That reduces visible page churn and lets ChatGPT retain the transcript **in the chat**. Its weakness
is coupling correctness to a long-lived SPA DOM. The refined design below adopts Prometheus's
in-chat persistence while keeping the daemon's DOM-reliability safeguards.

## Refined design

### One ChatGPT conversation tab per Pi session ID

Instead of a fresh Temporary Chat page for every turn, the daemon keeps a single ChatGPT
conversation page **per Pi session ID** and types each turn into that same conversation. This is what
makes ChatGPT retain context in the chat:

- The same Pi session ID reuses the same browser page, so the ChatGPT thread is continuous across
  turns and tool rounds.
- A new Pi session ID (a separate CLI `--print`/`--session`) opens a fresh ChatGPT conversation,
  matching Pi's own logical-conversation boundary.
- The full-history replay remains as the correctness fallback: when a fresh conversation cannot be
  guaranteed (new page, expired page, new session), `compileChatGptWebPrompt()` replays the complete
  accumulated context exactly as today.

This reuses Prometheus's in-chat persistence principle but scopes it per Pi session, so Pi's
`session`/`continue`/`resume`/`--session` semantics map 1:1 to ChatGPT threads.

### ~1 minute idle shutdown

- The vendored daemon config owns an idle shutdown timer.
- Activity (a request or new message) resets the timer; an active HTTP/browser turn postpones it.
- With **no new request/message for ~1 minute (60 s)**, the daemon closes the browser/conversation
  and exits.

This is daemon-owned because a Pi-side timer disappears when a short CLI process exits. The shorter
window keeps the account quiet between bursts while still preserving in-chat context during a normal
multi-turn run.

### Small window anchored in the top-left quarter

- The headed Chrome window is **small** and anchored to the **top-left quarter** of the screen
  (top-left corner position, modest size), so it is unobtrusive and out of the way while still
  retaining the desktop ChatGPT layout that avoids fragile mobile/responsive selectors.
- Playwright launch args (`--window-size`, top-left `--window-position`) and the viewport use the
  same small size.

### Stop the noisy local-computer warning in browser-only mode

The per-turn warning ("ChatGPT Web … cannot access the local Codex computer in this turn …") repeats
on every read-only/browser-only turn and is not actionable for the common case. The refined plan:

- Remove that repeated warning from read-only/browser-only turns.
- Keep local-tools guidance only where it is actionable and non-repetitive (e.g. Full-harness
  setup/status, or the one-time transition into a tool-capable model).

This makes browser-only output clean while keeping Full-harness onboarding discoverable.

### Continuity rule (unchanged intent)

- Same Pi session: one persistent ChatGPT conversation + full-history replay fallback; conversation
  continues in-chat.
- Separate CLI process: use Pi `--continue`, `--resume`, or `--session` to resume the same session
  (and therefore the same ChatGPT thread). The package cannot reconstruct history it was never given.
- A new Pi session intentionally starts a new ChatGPT conversation.

## Verification

- Package/runtime build passes.
- Package tests cover package config defaults and the absence of eager session-shutdown cleanup.
- Live acceptance runs two turns in one Pi session and verifies a remembered value stays visible in
  the ChatGPT thread; a separate Pi session starts a fresh ChatGPT conversation.
- Browser inspection shows one small top-left window reused for the session, closing ~1 minute after
  the last request/message.
