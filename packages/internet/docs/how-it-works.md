# How Internet Works

## Build and package

`npm run build` compiles package TypeScript, then the fixed vendored daemon snapshot into
`dist/daemon/runtime`. The manifest records the build host's `linux`/`darwin` platform and
`x64`/`arm64` architecture. Package CI repeats build, tests, and `npm pack --dry-run` on Ubuntu and
macOS.

## Extension startup

1. `AccountRegistry` reads schema-4 routing metadata or synthesizes the default ChatGPT account.
2. The provider registry registers enabled ChatGPT Web, Anthropic, and Google providers.
3. `OwnedDaemonManager` receives only ChatGPT Web accounts.
4. Tools, provider-scoped hooks, and HUD status are registered.
5. Authenticated browser daemons auto-start when `autoLogin` is enabled.

API credentials are `$ENV_VAR` references resolved by Pi. They never enter daemon state.

## ChatGPT login

Interactive login launches the daemon-owned headed Chrome profile and records storage state only
after verification. Optional storage-state import reads a bounded regular JSON file, removes every
cookie/origin outside ChatGPT/OpenAI, validates the resulting session in owned Chrome, then writes it
privately. Raw passwords and 2FA secrets are not accepted.

## ChatGPT inference

Pi serializes a normal `openai-responses` request to the account's loopback daemon. The neutral
runtime starts the bounded Bun HTTP host and owns process/service primitives. The ChatGPT Web
adapter owns the Responses routes and projection, browser replay, prompt adaptation, turn identity,
durable conversation binding, and Luna checkpoints. It captures the authenticated conversation
response from the authenticated network payload; missing or invalid wire responses fail clearly and
never fall back to DOM answer extraction. Pi decodes the returned Responses SSE through its built-in
transport.

### Dependency boundary

`vendor/runtime/src/cli.ts` is the composition root. It loads the ChatGPT adapter, which may import
neutral runtime modules such as `server.ts`, `service.ts`, `config.ts`, `http-body.ts`, and
`event-queue.ts`. Neutral modules never import `adapters/chatgpt-web/`. Responses parsing and SSE
projection stay with the adapter because they encode OpenAI/Codex protocol semantics rather than a
provider-neutral runtime contract.

### Request flow

```text
HTTP POST /v1/responses
  -> core server.ts (Bun HTTP host)
  -> adapters/chatgpt-web/server.ts (bounded body and route dispatch)
  -> adapters/chatgpt-web/responses/parser.ts
  -> adapters/chatgpt-web/adapter.ts (browser turn)
  -> adapters/chatgpt-web/responses/bridge.ts
  -> HTTP 200 text/event-stream
```

A future runtime adapter may reuse the core host and lifecycle primitives without inheriting
ChatGPT, OpenAI Responses, browser-state, or connector semantics. See the
[provider-neutral runtime boundary](review/daemon-boundary.md) review.

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
