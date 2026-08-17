# How Internet Works

## Build and package

`npm run build` compiles package TypeScript, then the fixed private daemon snapshot into
`dist/daemon/runtime`. The manifest records the build host's `linux`/`darwin` platform and
`x64`/`arm64` architecture. Package CI repeats build, tests, and `npm pack --dry-run` on Ubuntu and
macOS.

## Extension startup

1. `AccountRegistry` reads schema-4 routing metadata or synthesizes the default ChatGPT account.
2. The provider registry registers enabled ChatGPT Web, Gemini Web, Anthropic, and Google providers.
3. `OwnedDaemonManager` receives enabled browser accounts.
4. Tools, provider-scoped hooks, and HUD status are registered.
5. Authenticated browser daemons auto-start when `autoLogin` is enabled.

API credentials are `$ENV_VAR` references resolved by Pi. They never enter daemon state.

## Browser login

Interactive login launches the daemon-owned headed Chrome profile and records storage state only
after verification. Optional storage-state import reads a bounded regular JSON file, removes every
cookie/origin outside the provider allowlist, validates the resulting session in owned Chrome, then
writes it privately. Gemini retains only required Google/Gemini state. Raw passwords and 2FA secrets
are not accepted.

## Browser inference

Pi serializes a normal `openai-responses` request to the account's loopback daemon. The neutral
runtime starts the bounded Bun HTTP host and owns process/service primitives. Each provider adapter
owns request policy and browser execution. ChatGPT captures authenticated network payloads and never
falls back to DOM extraction. Gemini Web is text-only, discovers account-visible models, and uses
rendered Gemini response DOM as its sole authoritative output path. Pi decodes returned Responses
SSE through its built-in transport.

Every Gemini Pi session ID maps immutably to one native `/app/<chat-id>` conversation. Continuations
reopen that chat; missing continuation state or attempted rebinding fails closed.

### Dependency boundary

`runtime/src/cli.ts` is the composition root. It registers the ChatGPT Web and Gemini Web factories,
which may import neutral core and browser primitives. Core modules never import concrete providers.
Gemini browser modules do not import provider modules. Shared normalized protocol types and the
provider-neutral Responses bridge live under `core/`; ChatGPT-specific parser and projection behavior
remains under its provider namespace.

### Request flow

```text
HTTP POST /v1/responses
  -> core server.ts (Bun HTTP host)
  -> providers/chatgpt-web/server/routes.ts (bounded body and route dispatch)
  -> providers/chatgpt-web/protocol/responses/parser.ts
  -> providers/chatgpt-web/adapter.ts (browser turn)
  -> providers/chatgpt-web/protocol/responses/bridge.ts
  -> HTTP 200 text/event-stream
```

Gemini uses the same core host with `providers/gemini-web/server.ts`, the Gemini adapter, and the
core Responses bridge, without inheriting ChatGPT parser, browser-state, or connector semantics. See
the [implemented layout](layout.md) for the module maps.

## Full mode

`internet_harness` writes account-scoped Full configuration and restarts the daemon. The daemon
broker/MCP tunnel exposes registered `codex_*` tools, while Pi's `tool_call` hook validates the
account bridge and requests approval. Browser-only providers do not gain local tools; API providers
remain browser-less.

## Council

`internet_council` selects available models owned by enabled internet providers. Orchestrator runs
independent tool-free member tasks in parallel, then supplies their outputs to one chair synthesis
task. Abort signals and fixed task/concurrency/time/output limits bound the run.

## Shutdown

The manager serializes lifecycle operations per browser account, requests graceful daemon shutdown,
then escalates to `SIGTERM`/`SIGKILL` only for owned children that fail to exit. API providers and
council agents own no long-lived package process.
