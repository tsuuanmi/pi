# @tsuuanmi/pi-internet

Cross-platform Pi internet extension for isolated ChatGPT Web and Gemini Web browser runtimes,
Anthropic and Gemini API accounts, bounded multi-model councils, and public web search/fetch.

## Runtime model

- The browser-backed provider uses Pi's neutral private runtime compiled as a self-contained Bun
  executable for the build host (`linux` or `darwin`, `x64` or `arm64`). Google Chrome is the only
  host browser dependency.
- Each browser account owns a private config directory, browser storage state, loopback port, and
  daemon. ChatGPT Web can additionally use the optional Full-mode tool tunnel; Gemini Web is
  browser-only and text-only.
- Anthropic and Google accounts use Pi's native transports. Their registry entries store only an
  API-key environment-variable name.
- Council execution uses `@tsuuanmi/pi-orchestrator`; members run independently without tools and a
  chair synthesizes their outputs under fixed concurrency, task, time, and output caps.

The extension never reads another repository at runtime and never accepts raw account passwords or
2FA secrets.

## Install

```bash
npm install @tsuuanmi/pi-internet
```

The package manifest exposes `dist/extension.js` as a Pi extension. Source builds additionally
require Bun 1.3.14 to compile the private daemon.

## Accounts

With no registry file, Pi exposes one `chatgpt-web` provider backed by the implicit `default`
account at `127.0.0.1:17841`. Account metadata is persisted as an accounts list.

Use `internet_account_add` with:

- `provider: "openai"` for ChatGPT Web. `configDir` and `port` are optional; omitted ports are
  allocated from `17841`. Each Pi session uses one durable ChatGPT conversation.
- `provider: "gemini-web"` for Gemini Web. `configDir` and `port` are optional. Each Pi session ID
  maps one-to-one to one durable native Gemini chat ID; the runtime refuses to rebind that session
  to a different Gemini chat.
- `provider: "anthropic"` and `apiKeyEnv: "ANTHROPIC_API_KEY"` for Anthropic.
- `provider: "google"` and `apiKeyEnv: "GEMINI_API_KEY"` for Gemini.

Set those environment variables before loading Pi. Provider names are stable:

- `chatgpt-web` / `chatgpt-web-<account>`
- `anthropic-api` / `anthropic-api-<account>`
- `gemini-api` / `gemini-api-<account>`
- `gemini-web` / `gemini-web-<account>`

Account add/remove/enable changes require a Pi reload because providers are composed at extension
startup. `internet_account_remove` removes routing metadata only; it does not destroy private data.

## Browser login and lifecycle

```text
internet_daemon { action: "login" }
internet_daemon { action: "start" }
internet_daemon { action: "status" }
```

Login normally opens the daemon-owned Chrome profile. To import an existing Playwright
storage-state export:

```text
internet_daemon {
  action: "login",
  storageStatePath: "/absolute/path/to/storage-state.json"
}
```

The daemon applies the provider-specific origin allowlist, verifies authenticated account evidence
in its owned browser, and only then persists the state. Invalid imports fail without replacing the
stored login. Gemini Web retains only `google.com`, `accounts.google.com`, and `gemini.google.com`
cookies plus Gemini origin storage, and records the account-visible Flash, Thinking, and Pro modes.

Authenticated enabled daemons auto-start by default. `internet_settings { autoLogin: false }`
disables login prompting while preserving start of already authenticated accounts.

## Browser response capture

The browser adapter captures the authenticated conversation response from the authenticated wire
protocol. If the payload is invalid or absent, the turn fails clearly; DOM extraction is not used as
an answer fallback. Durable conversation replay, model capability gates,
and Pi's built-in `openai-responses` SSE transport remain authoritative.

Gemini Web uses the verified rendered `model-response` surface as its sole response source. It
streams stable completed lines, flushes the final text after completion, supports cancellation via
the native stop control, and quarantines a page if already-emitted DOM text changes. Tools, files,
images, structured output, and reasoning controls are rejected before browser acquisition.

## Council

```text
internet_council {
  question: "Compare the approaches and recommend one",
  preset: "balanced"
}
```

Presets select 2, 3, or 4 available internet models (`quick`, `balanced`, `deep`). Callers can instead
provide 2–6 explicit `provider/model` selectors and an optional chair. Members have no local tools,
run once, and are capped at 4,096 output tokens; synthesis runs only after all member tasks complete.

## Tools

- Accounts: `internet_accounts`, `internet_account_add`, `internet_account_remove`,
  `internet_account_set_enabled`
- Daemon: `internet_daemon`, `internet_status`, `internet_doctor`, `internet_control`,
  `internet_compact`, `internet_conversation`
- Orchestration: `internet_council`
- Full mode: `internet_harness`
- Settings/web: `internet_settings`, `internet_search`, `internet_fetch`

Full mode enables the private broker/MCP tunnel for registered `codex_*` tools. Pi remains the
approval boundary: tool calls default to deny and only the current account's valid local bridge can
run.

## Verification

```bash
# Build workspace dependencies first in a clean checkout
npm run build

cd packages/internet
npm run build
npm test
npm pack --dry-run
```

CI performs the package build, full package tests, and pack-content check on Ubuntu and macOS.
Credential-dependent browser/API smoke tests remain release-environment checks.

See [`docs/index.md`](docs/index.md) for architecture and source-level documentation.
