# Internet — Browser Design

This document details the **browser** the `internet` package uses, and how it stays **clean and
production-ready**. It is grounded in how codex-chatgpt-web already manages Chrome (the daemon the
package wraps), and it defines the browser contract the package should own.

Status: **implemented.**

> **Source:** reusable browser mechanics are implemented under
> `vendor/runtime/src/browser/`:
> `session.ts`, `turn.ts`, and `response-capture.ts`.
> ChatGPT-specific automation remains under
> `vendor/runtime/src/browser/chatgpt-web/`:
> `worker.ts`, `login.ts`, and `session.ts`.

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

`BrowserSession` owns one browser and context for both the maintenance page and leased conversation
pages. Page acquisition and eviction are serialized, and a leased page cannot be evicted.

- **One ChatGPT conversation tab per Pi session ID** — the same session reuses the same page so
  ChatGPT retains context in the chat; a new Pi session starts a separate conversation.
- **Durable journal** — the private journal stores the canonical conversation URL and checkpoint;
  normal continuation sends only the new suffix after the last acknowledged response.
- **Bounded concurrency** — at most `MAX_CHATGPT_BROWSER_TABS = 5` simultaneous turns (the daemon's
  constant). Unbounded fan-out would look like spam to the account.
- **Idle cleanup** — a conversation tab stays open while the session is active; after ~1 minute
  without a new request/message, the daemon closes it and exits.
- **Graceful close** — on Pi shutdown, drain and close all browser workers; in-flight launches are
  joined and timed-out pages are quarantined instead of returning to the page pool.

### 2.3 Cleanup guarantees

| Concern | Guarantee |
|---------|-----------|
| Page leak | Conversation tabs remain bound to their durable session and close on idle (~1 min) or session teardown |
| Browser leak | Worker shutdown drains active runs and maintenance, then closes the single tracked browser, including launch/shutdown races |
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
| Concurrency cap | `MAX_CHATGPT_BROWSER_TABS = 5` in `browser/chatgpt-web/session.ts` limits account-level fan-out |

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

The runtime owns the browser in two layers:

```
vendor/runtime/src/browser/
├── session.ts              # Playwright process/context/page ownership
├── turn.ts                 # concurrency, maintenance, and stage coordination
└── response-capture.ts     # response listener and parser lifecycle

vendor/runtime/src/browser/chatgpt-web/
├── worker.ts               # worker lifecycle and maintenance composition
├── turn-driver.ts          # ChatGPT turn-stage composition
├── interactions.ts         # composer, model, prompt, and file operations
├── completion.ts           # completion, trace, and DOM-health tracking
├── diagnostics.ts          # ChatGPT diagnostic shaping and redaction
├── wire-capture.ts         # ChatGPT response matching
├── login.ts                # ChatGPT login and capability verification
└── session.ts              # ChatGPT session policy and browser selectors
```

The `internet` package does **not** re-implement browser automation — it drives the runtime,
which owns the browser. This keeps package integration separate from browser behavior.

> **Key principle:** the package is a **thin client** over the runtime. The runtime owns the browser,
> the login, authenticated wire capture, and concurrency. The package owns Pi integration and
> cross-provider orchestration.

---

## 7. Implementation boundary

Direct modules in `src/browser/` contain reusable mechanics; provider browser implementations use
explicit subdirectories.

### Reusable modules in `src/browser/`

- browser/context/page lifecycle and deterministic shutdown;
- page acquisition, capacity, eviction, and active-page protection;
- turn concurrency, exclusive maintenance, cancellation, and stage deadlines;
- response listener lifecycle, bounded waiting, abort handling, and parse-error reporting;
- generic diagnostic artifact storage when the provider supplies the snapshot/redaction callback.

### ChatGPT implementation in `src/browser/chatgpt-web/`

- ChatGPT URLs, selectors, DOM interaction, composer/file attachment, and model/effort selection;
- submission and completion evidence, response DOM snapshots, trace extraction, and DOM health;
- ChatGPT login verification, account capability detection, and storage-state markers;
- ChatGPT wire-response matching and parsing.

The ChatGPT implementation is decomposed by responsibility:

| Module | Responsibility |
| --- | --- |
| `turn-driver.ts` | Compose stages and map provider events to the adapter |
| `interactions.ts` | Composer, model/effort, prompt, and file operations |
| `completion.ts` | DOM snapshots, completion evidence, trace, and health trackers |
| `diagnostics.ts` | ChatGPT-specific snapshot shaping and redaction |

ChatGPT selectors and response semantics stay below `src/browser/chatgpt-web/`; the reusable root
modules contain no provider URLs, selectors, protocols, or schemas. Shared primitives provide
observable stage timeouts, page quarantine, launch-safe close, serialized capacity, active leases,
and response waiting for events that arrive after `waitForValue()` begins.

---

## 8. Bottom line

- The only browser host is **system Chrome/Chromium via Playwright**, owned by the ChatGPT Web
  adapter inside the daemon.
- It is **only required for ChatGPT Web model routing**; search/fetch and future API providers are
  browser-less.
- Production-readiness comes from: explicit login + verified marker, durable per-session binding,
  bounded concurrency (5), graceful shutdown, atomic state, redacted diagnostics, and structured
  error mapping.
- The package stays **clean** by being a thin client over the daemon — it never re-implements
  browser automation.
