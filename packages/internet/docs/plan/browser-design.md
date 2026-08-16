# Internet — Browser Design

This document details the **browser** the `internet` package uses, and how it stays **clean and
production-ready**. It is grounded in how codex-chatgpt-web already manages Chrome (the daemon the
package wraps), and it defines the browser contract the package should own.

Status: **current implementation.**

> **Source:** the browser behavior is implemented under
> `vendor/codex-chatgpt-web/src/` in this package:
> `adapters/chatgpt-web/browser-worker.ts`, `browser-login.ts`, `chatgpt-session.ts`, and
> `adapters/chatgpt-web/concurrency.ts`.

---

## 1. Which browser, and why

The `internet` package uses **system Chrome/Chromium** via **Playwright** (`playwright-core`),
exactly as codex-chatgpt-web does. It does **not** download a browser.

| Decision | Choice | Why |
|----------|--------|-----|
| Engine | System Chrome/Chromium | No bundled download; uses the user's installed browser |
| Driver | `playwright-core` | Lightweight; no browser download; CDP-based |
| Login | Dedicated Chrome profile → `storageState` | Reuses the user's signed-in ChatGPT session |
| Browser visibility | Headed (`headed: true`) | Required for login, verification, and browser turns |

The browser is **only required for the ChatGPT Web model-routing path**. `internet_search` / `internet_fetch` and the Anthropic/Gemini API providers are browser-less.

---

## 2. Browser lifecycle (production-ready)

### 2.1 Login (one-time, explicit)

```
internet_login
  → launch system Chrome with a dedicated --user-data-dir profile
  → user signs in to ChatGPT in the visible window
  → capture context.storageState() → storage-state.json
  → write a verified marker (storage-state.json.verified.json)
  → close the login browser cleanly
```

- The login browser is **separate** from the turn browser (dedicated profile dir, cleaned up after).
- The captured `storageState` is the **session cookie**; it is written atomically (0600) and is the
  only durable browser state the package keeps.
- A **verified marker** proves the session is authenticated before any turn runs.

### 2.2 Turn browser (per Pi session, persistent conversation)

```
internet_turn (same Pi session ID)
  → ensure managed browser (launch once, reuse)
  → reuse the session's ChatGPT conversation tab
  → type/attach the turn into that conversation
  → run the turn
  → keep the tab open for the next turn

internet_turn (new Pi session ID)
  → ensure managed browser (reuse)
  → create and bind one ChatGPT conversation
  → run the turn
  → keep the tab open (idle ~1 min then close)
```

- **One ChatGPT conversation tab per Pi session ID** — the same session reuses the same page so
  ChatGPT retains context in the chat; a new Pi session starts a separate conversation.
- **Durable journal** — the private journal stores the canonical conversation URL and checkpoint;
  normal continuation sends only the new suffix after the last acknowledged response.
- **Bounded concurrency** — at most `MAX_CHATGPT_BROWSER_TABS = 5` simultaneous turns (the daemon's
  constant). Unbounded fan-out would look like spam to the account.
- **Idle cleanup** — a conversation tab stays open while the session is active; after ~1 minute
  without a new request/message, the daemon closes it and exits.
- **Graceful close** — on Pi shutdown, drain and close all browser workers; never abandon an
  in-flight turn.

### 2.3 Cleanup guarantees

| Concern | Guarantee |
|---------|-----------|
| Page leak | Conversation tabs remain bound to their durable session and close on idle (~1 min) or session teardown |
| Browser leak | `close()` awaits all active runs + maintenance, then closes the browser |
| Temp files | Login profile dir is removed after capture |
| Session state | `storageState` written atomically, 0600, under a 0700 dir |

---

## 3. Canonical browser host

Managed Chrome is the only browser host. The ChatGPT Web adapter launches system Chrome through
Playwright and owns its lifecycle. Configuration contains no browser-host selector, descriptor, or
external-browser attachment path. Browser hosting is an internal ChatGPT Web implementation detail,
not part of the shared provider contract.

---

## 4. Security model for the browser

| Boundary | Enforcement |
|-----------|------------|
| Loopback only | The daemon HTTP endpoint binds to `127.0.0.1`; never a remote service |
| Session isolation | One ChatGPT conversation tab per Pi session; never share a transcript across sessions |
| Storage | `storageState` 0600 under 0700 dir; login profile removed |
| Browser ownership | The ChatGPT Web adapter launches and closes its managed Chrome process |
| Untrusted model | The model's answer never grants browser authority; only the trusted environment does |
| Concurrency cap | `MAX_CHATGPT_BROWSER_TABS = 5` prevents account-level spam |

---

## 5. Production-readiness checklist

- [x] **No browser download** — use system Chrome/Chromium via `playwright-core`.
- [x] **Explicit login** — one-time, visible, verified marker; never silent.
- [x] **Per-session conversation** — one durable ChatGPT conversation per Pi session.
- [x] **Bounded concurrency** — cap simultaneous turns (5).
- [x] **Graceful shutdown** — drain + close all workers on Pi shutdown.
- [x] **Atomic state** — `storageState` written atomically, 0600.
- [x] **Durable cleanup** — conversation tabs close on idle or session teardown.
- [x] **Headed browser** — headed operation is retained for Cloudflare/browser-check reliability.
- [x] **Diagnostics** — on failure, capture a redacted DOM/screenshot snapshot (no credentials).
- [x] **Error mapping** — browser failures map to structured adapter errors (status/type/code/retryable).

---

## 6. Where the browser lives in the package

The browser is owned by the **`openai` provider** (ChatGPT Web path), not the whole package:

```
src/providers/openai/
├── daemon/          # HTTP client over the daemon (no browser here)
└── turn/            # turn adapter (talks to the daemon)
```

The browser itself is **inside the daemon** (codex-chatgpt-web's `browser-worker.ts`). The
`internet` package does **not** re-implement browser automation — it drives the daemon, which owns
the browser. This keeps the browser logic in one place (the daemon) and the package clean.

> **Key principle:** the package is a **thin client** over the daemon. The daemon owns the browser,
> the login, the DOM parsing, and the concurrency. The package owns the Pi integration (provider,
> tools, hooks) and the cross-provider orchestration (fusion, search).

---

## 7. Bottom line

- The only browser host is **system Chrome/Chromium via Playwright**, owned by the ChatGPT Web
  adapter inside the daemon.
- It is **only required for ChatGPT Web model routing**; search/fetch and future API providers are
  browser-less.
- Production-readiness comes from: explicit login + verified marker, durable per-session binding,
  bounded concurrency (5), graceful shutdown, atomic state, redacted diagnostics, and structured
  error mapping.
- The package stays **clean** by being a thin client over the daemon — it never re-implements
  browser automation.
