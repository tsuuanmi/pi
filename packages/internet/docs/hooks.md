# hooks

Mirrors `src/hooks.ts`.

Registers the extension's event hooks. The module owns the provider-scoped readiness/adaptation gate,
the interactive approval gate for privileged tools, and HUD refresh on turn end.

## `registerInternetHooks`

```ts
registerInternetHooks(
  host: InternetHookHost,
  manager: OwnedDaemonManager,
  accounts: InternetAccount[],
  settings: InternetSettingsService,
): void
```

Builds a map from enabled account provider names (`providerName(account)`) to account IDs, then
registers three handlers on the host.

### `tool_call` — interactive approval gate

Determines whether a tool call requires interactive approval:

- Any tool named `internet_control`, `internet_daemon`, or `internet_harness` always requires
  approval (with the action name surfaced in the prompt).
- Any bridged tool in `{ "codex_tool_call", "codex_exec", "codex_apply_patch" }` requires approval.

If the host has no UI, the call is blocked with `"This internet tool requires interactive approval."`.
Otherwise the user is asked to approve; an unapproved call returns
`{ block: true, reason: "Internet tool call was not approved." }`.

### `before_provider_request` — readiness and adaptation

Runs only for requests whose `context.model.provider` is a registered ChatGPT Web provider. On other
providers the original payload is returned untouched.

For a matching provider:

1. Look up the account and whether verified login exists.
2. If login is missing and `autoLogin` is false, notify (when UI exists) and return
   `rejectedChatGptWebRequest()` — the request is blocked without launching a browser.
3. If login is missing and `autoLogin` is true, notify that a login Chrome profile is opening.
4. `manager.ensureReady(accountId)` — ensures login and a healthy owned daemon.
5. `expandLocalFileReferences(payload, cwd)` — inline bounded workspace-local `@file` references.
6. `adaptChatGptWebRequest(payload, { cwd, sessionId, turnId })` — add the daemon's canonical
   identity/environment fields. `turnId` is the latest user entry in the current branch.

Any thrown error is caught: notify (when UI exists) and return `rejectedChatGptWebRequest()`, so the
original unadapted payload is never forwarded. See
[`backends/openai/turn/request.md`](backends/openai/turn/request.md) for what the rejected request
is.

### `turn_end` — HUD refresh

Calls `refreshHudUi(context)` after each turn so the daemon HUD reflects the latest status.
