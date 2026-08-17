# hooks

Mirrors `src/hooks.ts`.

Registers the extension's control hooks and event observer. The module owns the provider-scoped readiness/adaptation gate, the interactive approval gate for privileged tools, and HUD refresh on turn end.

## `registerInternetHooks`

```ts
registerInternetHooks(
  host: Pick<ExtensionAPI, "on" | "onHook">,
  manager: OwnedDaemonManager,
  accounts: BrowserInternetAccount[],
  settings: InternetSettingsService,
): void
```

Builds a map from enabled ChatGPT Web and Gemini Web provider names to account IDs, then
registers two hooks with `onHook(...)` and one observation with `on(...)`.

### `tool_call` hook — interactive approval gate

Determines whether a tool call requires interactive approval:

- Any tool named `internet_control`, `internet_daemon`, or `internet_harness` always requires
  approval (with the action name surfaced in the prompt).
- Any bridged tool in `{ "codex_tool_call", "codex_exec", "codex_apply_patch" }` requires approval.

If the host has no UI, the call is blocked with `"This internet tool requires interactive approval."`.
Otherwise the user is asked to approve; an unapproved call returns
`{ block: true, reason: "Internet tool call was not approved." }`.

### `before_provider_request` hook — readiness and adaptation

Runs only for requests whose `context.model.provider` belongs to a registered browser account. On
Anthropic and Google API accounts, the original payload is returned untouched.

For a matching provider:

1. Look up the account and whether verified login exists.
2. If login is missing and `autoLogin` is false, notify (when UI exists) and return
   `rejectedChatGptWebRequest()` — the request is blocked without launching a browser.
3. If login is missing and `autoLogin` is true, notify that a login Chrome profile is opening.
4. `manager.ensureReady(accountId)` — ensures login and a healthy owned daemon.
5. For ChatGPT Web, `expandLocalFileReferences(payload, cwd)` inlines bounded workspace-local
   `@file` references and the ChatGPT adapter adds its canonical environment metadata.
6. For Gemini Web, the adapter adds only the Pi `sessionId` and `turnId`, namespaces the selected
   model, and leaves files/tools for the runtime to reject. The Pi session ID is the durable
   one-to-one key for the native Gemini chat.

Any thrown error is caught: notify (when UI exists) and return `rejectedChatGptWebRequest()`, so the
original unadapted payload is never forwarded. See
[`providers/openai/turn/request.md`](providers/openai/turn/request.md) for what the rejected request
is.

### `turn_end` event — HUD refresh

Calls `refreshHudUi(context)` after each turn so the daemon HUD reflects the latest status.
