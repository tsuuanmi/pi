# Internet Usage

## Choose a provider

The implicit browser account registers `chatgpt-web/*`. Additional account names append the account
id. API accounts register `anthropic-api[-<id>]/*` or `gemini-api[-<id>]/*`.

Create API accounts with environment references, not secret values:

```text
internet_account_add {
  id: "research",
  provider: "anthropic",
  apiKeyEnv: "ANTHROPIC_RESEARCH_KEY"
}
```

```text
internet_account_add {
  id: "research-google",
  provider: "google",
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

ChatGPT account ports are allocated from `17841` when omitted and must remain unique loopback
endpoints.

## ChatGPT models and files

ChatGPT Web exposes canonical Sol route models, with Pro routes gated by account capability. Pi `@file` references are expanded only
for regular workspace-local files, under bounded count and byte limits. API providers use their
native image/text support and do not use the browser replay adapter.

## Durable conversations

Each Pi session binds to one canonical ChatGPT conversation after a live canary. The browser is an
access mechanism, not the durable identity: browser and daemon idle shutdown close only the
ephemeral process and tab, never the conversation or the session-to-conversation mapping. The next
ChatGPT turn restarts the browser, opens the saved canonical conversation URL, validates the
checkpoint, and appends the new suffix.

```text
Pi session S -> private conversation journal -> ChatGPT conversation C
                                      |
                              ephemeral browser process
```

- The first ChatGPT turn in a Pi session creates conversation C and persists the mapping.
- Later ChatGPT turns append to C rather than creating another conversation.
- Switching models does not remove the mapping; other-model turns stay in Pi history and are
  synchronized when ChatGPT is selected again.
- A new Pi session receives a separate ChatGPT conversation.

The adapter rejects attachments, ambiguous/diverged replay, and conversation-id changes rather than
silently forking state. Conversation ids are immutable after the first successful turn; a later
identity change marks the turn as failed instead of rebinding the session. Generated
`<environment_context>` messages are excluded from the persistent history prefix, and consecutive
assistant phases (commentary, reasoning-only, final answer) are acknowledged as one response.

**Not implemented.** A completed browser response that Pi did not persist (for example, Pi was
interrupted before writing the assistant response) is a known gap. The durable protocol needs an
explicit client-acknowledgement/replay state so a retry replays the stored response instead of
resubmitting; see [Future work](future-work.md).

## Full local-tool mode

```text
internet_harness {
  action: "enable",
  account: "default",
  runtimeKey: "<private key>",
  tunnelClientPath: "/absolute/path/to/tunnel-client"
}
```

Full mode uses the same durable ChatGPT conversation as browser-only mode. The vendored broker/MCP
tunnel exposes registered `codex_*` tools. Pi requests approval and denies unrecognized or mismatched
bridges. Use `internet_harness { action: "disable" }` to return to read-only browser mode.

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
  members: ["chatgpt-web/high", "anthropic-api-research/claude-sonnet-5"],
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
