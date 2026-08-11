# Internet — Browser Design

This document details the **browser** the `internet` package uses, and how it stays **clean and
production-ready**. It is grounded in how codex-chatgpt-web already manages Chrome (the daemon the
package wraps), and it defines the browser contract the package should own.

Status: **proposal.** No code changes.

> **Source:** the browser behavior below is implemented in the daemon repo
> `/home/superman/workspaces/codex-chatgpt-web`:
> `src/adapters/chatgpt-web/browser-worker.ts`, `src/browser-login.ts`, `src/chatgpt-session.ts`,
> `src/launcher-browser-host.ts`, `src/adapters/chatgpt-web/concurrency.ts`.
> See [source-repositories.md](source-repositories.md) for the full map.

---

## 1. Which browser, and why

The `internet` package uses **system Chrome/Chromium** via **Playwright** (`playwright-core`),
exactly as codex-chatgpt-web does. It does **not** download a browser.

| Decision | Choice | Why |
|----------|--------|-----|
| Engine | System Chrome/Chromium | No bundled download; uses the user's installed browser |
| Driver | `playwright-core` | Lightweight; no browser download; CDP-based |
| Login | Dedicated Chrome profile → `storageState` | Reuses the user's signed-in ChatGPT session |
| Headless | Configurable (`headed`, default **headed**) | Headed for login/verification; headless for turns |

The browser is **only required for the ChatGPT Web model-routing path**. `internet_search` /
`internet_fetch` and the future Claude/Gemini API backends are browser-less.

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

### 2.2 Turn browser (per-turn, isolated)

```
internet_turn
  → ensure managed browser (launch once, reuse)
  → newContext({ storageState })   # isolated context per turn
  → newPage()                      # fresh Temporary Chat document
  → run the turn
  → close the page (and context)   # never reuse a transcript
```

- **One fresh page per turn** — never reuses a transcript or autocomplete DOM.
- **Bounded concurrency** — at most `MAX_CHATGPT_BROWSER_TABS = 5` simultaneous turns (the daemon's
  constant). Unbounded fan-out would look like spam to the account.
- **Graceful close** — on Pi shutdown, drain and close all browser workers; never abandon an
  in-flight turn.

### 2.3 Cleanup guarantees

| Concern | Guarantee |
|---------|-----------|
| Page leak | Every page/context is closed in a `finally` block |
| Browser leak | `close()` awaits all active runs + maintenance, then closes the browser |
| CDP connection | `connectOverCDP` close releases the transport (does not kill the launcher process) |
| Temp files | Login profile dir is removed after capture |
| Session state | `storageState` written atomically, 0600, under a 0700 dir |

---

## 3. Browser modes

The package supports two browser hosts, mirroring codex-chatgpt-web:

| Mode | How | When |
|------|-----|------|
| **Managed Chrome** | Package launches Chrome via Playwright | Default; self-contained |
| **Launcher** | Attach to an existing Electron/launcher browser via CDP descriptor | When the user already runs a launcher-owned ChatGPT surface |

The launcher mode uses a **descriptor file** (loopback CDP endpoint + control token) that is
validated strictly (ownership, permissions, shape) before connecting.

---

## 4. Security model for the browser

| Boundary | Enforcement |
|-----------|------------|
| Loopback only | CDP endpoint must be `127.0.0.1`; never a remote browser |
| Session isolation | Per-turn context; never share a transcript |
| Storage | `storageState` 0600 under 0700 dir; login profile removed |
| Descriptor trust | Launcher descriptor validated (owner, perms, shape, token) |
| Untrusted model | The model's answer never grants browser authority; only the trusted environment does |
| Concurrency cap | `MAX_CHATGPT_BROWSER_TABS = 5` prevents account-level spam |

---

## 5. Production-readiness checklist

- [ ] **No browser download** — use system Chrome/Chromium via `playwright-core`.
- [ ] **Explicit login** — one-time, visible, verified marker; never silent.
- [ ] **Per-turn isolation** — fresh page/context per turn; never reuse a transcript.
- [ ] **Bounded concurrency** — cap simultaneous turns (5).
- [ ] **Graceful shutdown** — drain + close all workers on Pi shutdown.
- [ ] **Atomic state** — `storageState` written atomically, 0600.
- [ ] **Cleanup in `finally`** — no page/browser/connection leaks.
- [ ] **Headless toggle** — `headed` config; headed for login, headless for turns.
- [ ] **Diagnostics** — on failure, capture a redacted DOM/screenshot snapshot (no credentials).
- [ ] **Error mapping** — browser failures map to structured adapter errors (status/type/code/retryable).

---

## 6. Where the browser lives in the package

The browser is owned by the **`openai` backend** (ChatGPT Web path), not the whole package:

```
src/backends/openai/
├── daemon/          # HTTP client over the daemon (no browser here)
└── turn/            # turn adapter (talks to the daemon)
```

The browser itself is **inside the daemon** (codex-chatgpt-web's `browser-worker.ts`). The
`internet` package does **not** re-implement browser automation — it drives the daemon, which owns
the browser. This keeps the browser logic in one place (the daemon) and the package clean.

> **Key principle:** the package is a **thin client** over the daemon. The daemon owns the browser,
> the login, the DOM parsing, and the concurrency. The package owns the Pi integration (provider,
> tools, hooks, skill) and the cross-backend orchestration (fusion, search).

---

## 7. Bottom line

- The browser is **system Chrome/Chromium via Playwright**, owned by the daemon, not the package.
- It is **only required for ChatGPT Web model routing**; search/fetch and future API backends are
  browser-less.
- Production-readiness comes from: explicit login + verified marker, per-turn isolation, bounded
  concurrency (5), graceful shutdown, atomic state, `finally` cleanup, headless toggle, redacted
  diagnostics, and structured error mapping.
- The package stays **clean** by being a thin client over the daemon — it never re-implements
  browser automation.
