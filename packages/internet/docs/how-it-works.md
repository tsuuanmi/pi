# Internet — How It Works

## Startup

1. Pi loads `dist/extension.js` and awaits the default extension factory.
2. The account registry loads persisted records. If none exist, it synthesizes a `default` account
   from daemon config, or from the documented loopback default (`127.0.0.1:17841`).
3. Enabled accounts are registered as Pi `openai-responses` providers.
4. The extension registers tools, hooks, and the HUD provider.

Provider registration does not require the daemon to be running. A model request or daemon tool
returns a clear connection error if it is unavailable.

## Model inference

```
Pi selects chatgpt-web/high or chatgpt-web/luna
        │
        ▼
Pi's native openai-responses stream handler
        │ POST http://127.0.0.1:17841/v1/responses
        ▼
codex-chatgpt-web daemon
        │ browser turn + standard Responses SSE
        ▼
Pi's native handler streams assistant events
```

The package deliberately has no SSE adapter or replay module. Pi owns Responses decoding; the
daemon owns browser-turn replay/dedup.

## Status and HUD

`internet_status` resolves the requested account (or the first enabled account), validates its
private daemon config, and calls `/healthz`. The HUD uses the default daemon and hides itself when
configuration or connectivity is unavailable. On each Pi `turn_end`, the HUD is refreshed.

## Compaction

`internet_compact` sends `{ model, input, instructions? }` to `/v1/responses/compact` and returns
the daemon's replacement history. Luna requests are rejected before I/O because Luna maintains a
rolling checkpoint and the daemon disables separate compaction for it.

## Control plane

`internet_control` supports:

| Action | Route |
|---|---|
| `drain` | `POST /admin/drain` |
| `resume` | `POST /admin/resume` |
| `shutdown` | `POST /admin/shutdown` |
| `cancel-browser-turns` | `POST /admin/cancel-browser-turns` |

Only these calls include `Authorization: Bearer <controlToken>`. A daemon refusal, including a 409
shutdown refusal while turns are active, is surfaced as a typed `InternetError`.

## Accounts

Account records identify an OpenAI/ChatGPT Web daemon by id, display name, config directory,
loopback endpoint, and enabled state. Add/enable changes are persisted atomically and become
provider registrations after Pi reloads.

## Approval guard

The fail-closed `tool_call` guard protects every daemon control action and the documented future
`codex_tool_call`, `codex_exec`, and `codex_apply_patch` names. Noninteractive use is blocked;
interactive use requires confirmation.
