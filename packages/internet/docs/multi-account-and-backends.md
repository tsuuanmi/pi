# Internet — Multi-Account & Multi-Backend Brainstorm

This document brainstorms how `internet` supports **multiple accounts per provider** and stays
future-proof for **Claude and Gemini** backends, while keeping the MVP minimal and not changing
the Pi ecosystem.

- **MVP:** ChatGPT Web via one codex-chatgpt-web daemon. Works with current Pi as-is.
- **Next:** multiple ChatGPT accounts.
- **Future:** Claude and Gemini backends behind the same abstraction.

Status: **proposal / brainstorm.** Nothing is implemented.

---

## 1. The core model: account = daemon instance

The decisive fact (confirmed in `codex-chatgpt-web/src/config.ts`): a codex-chatgpt-web daemon is a
**single account/session**. Its identity is its config dir, chosen by `CODEX_CHATGPT_WEB_HOME`, and
it owns its own:

- `port` (default `17841`)
- `storageStatePath` (the ChatGPT browser session cookies)
- `brokerSocketPath` (full-mode turn broker)
- `controlToken`

So **one ChatGPT account = one running daemon = one `baseUrl`**. "Multiple accounts for the
`chatgpt-web` provider" therefore means **multiple daemon instances, each on its own port**.

```
Account A  ──►  daemon@:17841   baseUrl=http://127.0.0.1:17841/v1
Account B  ──►  daemon@:17842   baseUrl=http://127.0.0.1:17842/v1
Account C  ──►  daemon@:17843   baseUrl=http://127.0.0.1:17843/v1
```

Pi registers each as a provider (or as models under one provider). The abstraction between them is
the **backend adapter** (see §4).

---

## 2. How multi-account maps onto Pi's provider registry

From `packages/pi/src/api/provider-types.ts`, `registerProvider(name, config)` accepts:

- `name`, `baseUrl`, `api`, `headers`, `authHeader`, `models[]`
- `ProviderModelConfig` supports **per-model `baseUrl` and `headers` overrides**.

There are two viable registration strategies.

### Strategy A — one provider per account

```ts
// one ChatGPT account → one provider name
pi.registerProvider("chatgpt-web", {
  name: "ChatGPT Web",
  api: "openai-responses",
  baseUrl: "http://127.0.0.1:17841/v1",   // account A
  authHeader: false,                       // loopback; /v1/responses unauthenticated
  models: [sol, luna],
});

pi.registerProvider("chatgpt-web-2", {
  name: "ChatGPT Web (Work)",
  api: "openai-responses",
  baseUrl: "http://127.0.0.1:17842/v1",   // account B
  authHeader: false,
  models: [sol, luna],
});
```

- **Pros:** dead simple; each account is a named provider in the Pi model picker; per-account
  control (`baseUrl`, `headers`) is clean; matches how Pi already models providers.
- **Cons:** N providers for N accounts; the model picker shows N × 2 models. Fine for a small
  number of accounts.

### Strategy B — one provider, per-model `baseUrl` override

```ts
pi.registerProvider("chatgpt-web", {
  name: "ChatGPT Web",
  api: "openai-responses",
  authHeader: false,
  models: [
    // account A
    { id: "gpt-5.6-sol", baseUrl: "http://127.0.0.1:17841/v1", ... },
    { id: "gpt-5.6-luna", baseUrl: "http://127.0.0.1:17841/v1", ... },
    // account B
    { id: "gpt-5.6-sol-work", baseUrl: "http://127.0.0.1:17842/v1", ... },
    { id: "gpt-5.6-luna-work", baseUrl: "http://127.0.0.1:17842/v1", ... },
  ],
});
```

- **Pros:** one provider entry; a single model list.
- **Cons:** requires distinct model **ids** per account (`-work` suffix), which pollutes the model
  namespace and forces the daemon to accept arbitrary slugs.

### Recommendation

**Strategy A for MVP-to-near-term.** It is the least invasive, maps naturally to Pi's provider
model, and avoids inventing synthetic model ids. Revisit **Strategy B** only if the model picker
becomes crowded with many accounts.

---

## 3. Account lifecycle management

Multiple accounts need a management surface. Keep it minimal and config-driven:

### 3.1 Account registry (package-owned config)

A small config file under `<internet-config>/accounts.json`:

```jsonc
{
  "accounts": [
    {
      "id": "personal",
      "backend": "openai",
      "displayName": "Personal",
      "port": 17841,
      "configDir": "~/.codex-chatgpt-web",   // CODEX_CHATGPT_WEB_HOME
      "enabled": true
    },
    {
      "id": "work",
      "backend": "openai",
      "displayName": "Work",
      "port": 17842,
      "configDir": "~/.codex-chatgpt-web-work",
      "enabled": true
    }
  ]
}
```

The `backend` field selects the adapter (`openai` / `anthropic` / `google`). Each backend's
`register(pi, accounts)` maps its enabled accounts to `pi.registerProvider(...)` calls.

### 3.2 Package tools

- `internet_accounts` — list configured accounts and their daemon status.
- `internet_account_add` — register a new account (choose a free port, set `CODEX_CHATGPT_WEB_HOME`,
  point at a config dir). It **does not** manage the daemon's login (that is the daemon's setup),
  it just records the mapping.
- `internet_account_enable` / `internet_account_disable` — toggle which accounts register providers.

### 3.3 Re-registration

Because Pi's `registerProvider` replaces models for a provider, `internet` re-runs registration on
config changes and on startup. There is **no per-account runtime switching** needed at the Pi layer —
the account is baked into the provider's `baseUrl` at registration time.

---

## 4. The backend adapter seam (future Claude / Gemini)

The MVP registers a `chatgpt-web` provider directly. To keep Claude and Gemini future-proof without
shipping them, introduce a thin **backend adapter** abstraction that the provider registration uses.
Each backend lives in its own folder under `src/backends/`:

```ts
// src/backends/backend.ts
export interface InternetBackend {
  readonly providerName: string;   // "chatgpt-web" | "claude" | "gemini"
  readonly api: Api;               // "openai-responses" | "anthropic-messages" | "openai-completions"
  register(pi: ExtensionAPI, accounts: Account[]): void;
}
```

Each backend implements `register`, which calls `pi.registerProvider(...)` for each enabled account.
For MVP:

- **`src/backends/openai/`** — `api: "openai-responses"`, `baseUrl` per account (daemon port), `authHeader: false`.
- **Future `src/backends/anthropic/`** — `api: "anthropic-messages"`, `apiKey`/`oauth` from account config, `baseUrl` to Anthropic or a local proxy.
- **Future `src/backends/google/`** — `api: "openai-completions"` (Gemini's OpenAI-compat endpoint) or a dedicated stream, `apiKey`/`oauth`.

This seam is the single point where account → provider mapping happens. It does **not** require any
Pi ecosystem change — it uses the same `registerProvider` the MVP already uses.

### Why this stays clean

- **Accounts are data** (the registry), not code. Adding an account = adding a row + registering a
  provider.
- **Backends are adapters** behind one interface. MVP ships `src/backends/openai/`; Claude and
  Gemini are additive folders.
- **Pi is untouched.** All of this uses `registerProvider` (and later `oauth`) exactly as Pi
  exposes them today.

---

## 5. Auth per account, per backend

| Backend | Auth mechanism | MVP? |
|---------|----------------|------|
| chatgpt-web | None on `/v1/responses` (loopback). Control token only for `/admin/*`. `authHeader: false`. | Yes |
| claude (future) | `apiKey` or `oauth` (Pi's `ProviderConfig.oauth` for `/account add`). | No |
| gemini (future) | `apiKey` or `oauth`. | No |

For chatgpt-web, `authHeader` stays `false` because the loopback daemon does not require a key on the
inference path. For future backends, `internet` can read credentials from the account registry (env
interpolation or `!command` are both supported by Pi's `apiKey`).

---

## 6. Risks and open questions

| Risk / question | Note |
|-----------------|------|
| **Port collisions** when adding accounts | `internet_account_add` must pick a free loopback port and verify the daemon is reachable. |
| **Model picker crowding** with many accounts × models | Strategy A multiplies providers. Acceptable near-term; revisit Strategy B if it hurts. |
| **Distinct model ids** (Strategy B) require the daemon to route arbitrary slugs | Avoid Strategy B until `routeChatGptWebRequest` tolerates suffixed slugs. |
| **Account switching is not dynamic** — it is baked into provider `baseUrl` at registration | Acceptable; re-register on config change. A "switch account on the fly" feature is post-MVP. |
| **Claude/Gemini API shape** | Use Pi's native `anthropic-messages` and OpenAI-compat stream handlers; no custom SSE parser needed for the common case. |
| **OAuth** for future backends | Pi already supports `ProviderConfig.oauth`; reuse it rather than building a login flow. |
| **Daemon lifecycle per account** | MVP requires daemons to be running; auto-start/stop per account is a follow-up. |

---

## 7. Roadmap update

1. **MVP:** one `chatgpt-web` account via `registerProvider` (Strategy A), `authHeader:false`,
   `internet_status` / `internet_compact` tools, HUD, skill. — current milestone.
2. **Multi-account chatgpt-web:** account registry + `internet_account_*` tools + per-account
   `registerProvider`. — next.
3. **Full-mode tool bridge:** codex_tool_call/exec/apply_patch + approval hook. — post-MVP.
4. **Daemon lifecycle per account** (auto start/stop). — post-MVP.
5. **Claude backend** behind the `InternetBackend` seam (`anthropic-messages`). — deferred.
6. **Gemini backend** behind the same seam. — deferred.

The backend adapter + account registry are the two seams that make all of this additive: the MVP
uses a tiny slice, and Claude/Gemini plug in without touching Pi or reworking the chatgpt-web path.

---

## 8. Bottom line

- **Multi-account = multiple daemons = multiple Pi providers (Strategy A).** No Pi ecosystem change.
- **Backend adapter seam** keeps Claude/Gemini future-proof without shipping them.
- **Account registry as data** keeps adding accounts trivial.
- The MVP stays exactly as agreed: model routing via `registerProvider`, nothing more invasive.
