# Internet — Multi-Account Sign-In and Credential Automation

This document covers the account side of multi-agent support: the package must support **sign-in to
multiple accounts**, and we explore whether sign-in can be automated with credentials like
`account|password|2fa` instead of manual sign-in for each account.

> Status: **analysis + direction.** This is a design analysis. It records the current manual sign-in
> model, why credential automation is hard for ChatGPT Web, and the recommended path.

---

## 1. Multi-agent requires multiple accounts

The future team model is **multi-provider × multi-account** (e.g. 3 ChatGPT + 1 Gemini + 1 Claude).
Each team member is a Pi agent backed by a specific account. So the package must support:

- **Multiple accounts per provider** — e.g. 3 ChatGPT accounts, each its own daemon on its own port.
- **Multiple providers** — ChatGPT, Gemini, Claude, each with its own account(s).

The account registry already supports this structurally: `AccountRegistry` stores a list of
accounts, each with its own `id`, `configDir`, `host`, `port`, and `enabled` flag. `internet_account_add`
adds an account; `internet_account_set_enabled` toggles it. Each account is an isolated daemon
instance.

### Current sign-in is manual and per-account

Today, sign-in is **interactive and manual** for each account:

- `internet_daemon login` (or the first model request) launches the daemon's `login` command.
- `loginToChatGpt()` (in the vendored `browser/login.ts`) opens a **normal Chrome window** with a
  dedicated profile, prints "Sign in to ChatGPT, confirm that the composer is visible, then quit
  this dedicated Chrome instance completely", and waits for the user to complete sign-in manually.
- It then captures the storage state, verifies authentication, and writes a verification marker.

So for N accounts, the user must manually sign in N times. This is the current bottleneck for
multi-agent.

---

## 2. Can we automate sign-in with `account|password|2fa`?

The question: can the package accept `account|password|2fa` and sign in automatically, instead of
manual sign-in for each account?

### The honest answer: not reliably for ChatGPT Web

Automating ChatGPT Web sign-in with raw credentials is **fragile and against the platform's
anti-automation posture**:

- **Cloudflare / browser checks.** ChatGPT Web is behind Cloudflare and browser-check challenges.
  The package deliberately keeps `headed: true` because headless/automated sessions get challenged.
  Programmatic credential entry is exactly the kind of automation the platform resists.
- **2FA is not a static value.** A 2FA code is time-based (TOTP) or push-based. A static
  `account|password|2fa` string cannot represent a live TOTP code or a push approval. The user would
  still need to supply the current code or approve the push.
- **Password managers / SSO.** Many accounts use Google/Apple SSO or a password manager, which a
  scripted form-fill cannot drive.
- **Session capture is the durable artifact.** The daemon's login flow captures a **storage state**
  (cookies + local storage) that is the real credential. Reusing that captured session is reliable;
  re-entering credentials is not.

So **raw `account|password|2fa` automation is not a reliable design** for ChatGPT Web. It would be
brittle, would break on platform changes, and would fight the anti-automation posture the package
already works around.

---

## 3. Better designs for multi-account sign-in

Instead of raw credential automation, the recommended approaches:

### 3.1 One-time manual sign-in per account, then session reuse (recommended)

Keep the current manual sign-in, but make it **one-time per account**:

- The user signs in manually once per account (via `internet_daemon login`).
- The daemon captures and verifies the storage state; the account stays signed in.
- Subsequent runs reuse the captured session — no re-sign-in.

This is already how it works. The improvement is **batching**: a `login` flow that walks the user
through each enabled account once, so setting up a 3-ChatGPT team is one guided pass, not three
separate discoveries.

### 3.2 Session import / export

Allow the user to **import an existing signed-in session** (a storage-state file) for an account,
instead of re-signing in. This is useful when the user already has a ChatGPT session in another
browser or a previous setup. The package validates the imported session the same way it validates a
fresh login.

### 3.3 TOTP-assisted automation (partial, opt-in)

For accounts that use **TOTP 2FA** (not push, not SSO), the package could accept
`account|password|totp-secret` and:

- Fill the email/password form.
- Compute the current TOTP code from the secret and fill it.
- Capture the session.

This is **opt-in and best-effort**: it works only for plain email/password + TOTP accounts, and it
still risks Cloudflare challenges. It is a **future, low-priority** option, not a default.

### 3.4 What NOT to do

- Do **not** store plaintext passwords or 2FA secrets in the account registry. The registry is
  `0600`, but credentials are a different trust class than routing metadata.
- Do **not** make credential automation the default path — it is fragile and fights the platform.
- Do **not** try to automate push-based or SSO 2FA — it cannot be scripted reliably.

---

## 4. Recommended path

1. **Now:** keep one-time manual sign-in per account, but add a **guided multi-account login** flow
   that walks the user through all enabled accounts in one pass.
2. **Next:** add **session import/export** so a user can reuse an existing signed-in session instead
   of re-signing in.
3. **Future (opt-in, low priority):** TOTP-assisted automation (`account|password|totp-secret`) for
   plain email/password + TOTP accounts, best-effort, never the default.
4. **Never:** raw `account|password|2fa` automation as a default, plaintext credential storage, or
   push/SSO automation.

---

## 5. Bottom line

- Multi-agent requires **multiple accounts**, and the registry already supports it structurally.
- **Raw `account|password|2fa` automation is not reliable** for ChatGPT Web (Cloudflare, live TOTP,
  SSO, password managers). The durable artifact is the **captured session**, not the credentials.
- The recommended design is **one-time manual sign-in per account + session reuse**, with a
  **guided multi-account login** flow and **session import/export**.
- **TOTP-assisted automation** is a future, opt-in, best-effort option for plain email/password +
  TOTP accounts only.
- Do not store plaintext credentials; do not automate push/SSO 2FA.
