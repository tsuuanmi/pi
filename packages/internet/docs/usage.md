# Internet Usage

## Choose a provider

The implicit browser account registers `chatgpt-web/*`. Additional account names append the account
id. API accounts register `anthropic-api[-<id>]/*` or `gemini-api[-<id>]/*`.

Create API accounts with environment references, not secret values:

```text
internet_account_add {
  id: "research",
  backend: "anthropic",
  apiKeyEnv: "ANTHROPIC_RESEARCH_KEY"
}
```

```text
internet_account_add {
  id: "research-google",
  backend: "google",
  apiKeyEnv: "GEMINI_RESEARCH_KEY"
}
```

Export the variables and reload Pi after account changes.

## ChatGPT Web login

```text
internet_daemon { action: "login", account: "default" }
```

Complete sign-in in the daemon-owned headed Chrome window. For an existing Playwright storage-state
export, use an absolute path:

```text
internet_daemon {
  action: "login",
  account: "default",
  storageStatePath: "/Users/me/private/chatgpt-storage.json"
}
```

Only ChatGPT/OpenAI state is copied, and the import is persisted only after browser verification.
The source file is not modified.

Use `internet_daemon` actions `status`, `start`, `stop`, and `restart` for lifecycle. Run
`internet_doctor` for structured runtime/config/login/browser/daemon checks.

## Accounts

- `internet_accounts {}` lists routing metadata.
- `internet_account_add` adds one `openai`, `anthropic`, or `google` account.
- `internet_account_remove { id }` removes metadata without deleting private data.
- `internet_account_set_enabled { id, enabled }` changes startup/provider availability.
- `internet_account_conversation_mode { id, mode }` changes only ChatGPT Web temporary/durable mode.

ChatGPT account ports are allocated from `17841` when omitted and must remain unique loopback
endpoints.

## ChatGPT models and files

ChatGPT Web exposes capability-scoped Luna/Sol route models. Pi `@file` references are expanded only
for regular workspace-local files, under bounded count and byte limits. API providers use their
native image/text support and do not use the browser replay adapter.

## Temporary and durable conversations

Temporary mode is the default and isolates each turn from ChatGPT history. Durable mode binds one Pi
session to one canonical ChatGPT conversation after a live canary. It rejects attachments,
ambiguous/diverged replay, and conversation-id changes rather than silently forking state.

## Full local-tool mode

```text
internet_harness {
  action: "enable",
  account: "default",
  runtimeKey: "<private key>",
  tunnelClientPath: "/absolute/path/to/tunnel-client"
}
```

Full mode is account-scoped and remains on Temporary Chat. The vendored broker/MCP tunnel exposes
registered `codex_*` tools. Pi requests approval and denies unrecognized or mismatched bridges. Use
`internet_harness { action: "disable" }` to return to browser-only mode.

## Council

```text
internet_council {
  question: "Evaluate the options and recommend one",
  preset: "balanced"
}
```

Presets use 2/3/4 available internet models. Explicit selection uses unique `provider/model` strings:

```text
internet_council {
  question: "Review this decision",
  members: ["chatgpt-web/luna", "anthropic-api-research/claude-sonnet-5"],
  chair: "anthropic-api-research/claude-sonnet-5"
}
```

Members have no tools and run once. The result text is the chair synthesis; tool `details` include
individual responses and routing.

## Public web

`internet_search { query, limit? }` returns source URLs/snippets. `internet_fetch { url }` returns
bounded readable public HTTP(S) text. Fetch blocks URL credentials, unsafe ports, private/reserved
addresses, DNS rebinding targets, and unsafe redirects.

## Settings and status

`internet_settings {}` reads `autoLogin`; passing a boolean updates it atomically.
`internet_status`, `internet_control`, and `internet_compact` are ChatGPT Web-only tools and reject
API accounts at the account boundary.
