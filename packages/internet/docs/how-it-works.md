# How Internet Works

## Build and package

`npm run build` compiles package TypeScript, then the fixed vendored daemon snapshot into
`dist/daemon/runtime`. The manifest records the build host's `linux`/`darwin` platform and
`x64`/`arm64` architecture. Package CI repeats build, tests, and `npm pack --dry-run` on Ubuntu and
macOS.

## Extension startup

1. `AccountRegistry` reads schema-2 routing metadata or synthesizes the default ChatGPT account.
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

Pi serializes a normal `openai-responses` request to the account's loopback daemon. The daemon owns
browser replay, prompt adaptation, turn identity, durable conversation binding, and Luna checkpoints.
It captures the authenticated conversation response from the network payload when possible; DOM
extraction is used only when wire capture is unavailable or invalid. The daemon returns Responses
SSE, which Pi decodes through its built-in transport.

## Full mode

`internet_harness` writes account-scoped Full configuration and restarts the daemon. The daemon
broker/MCP tunnel exposes registered `codex_*` tools, while Pi's `tool_call` hook validates the
account bridge and requests approval. Browser-only and API providers do not gain local tools.

## Council

`internet_council` selects available models owned by enabled internet providers. Orchestrator runs
independent tool-free member tasks in parallel, then supplies their outputs to one chair synthesis
task. Abort signals and fixed task/concurrency/time/output limits bound the run.

## Shutdown

The manager serializes lifecycle operations per browser account, requests graceful daemon shutdown,
then escalates to `SIGTERM`/`SIGKILL` only for owned children that fail to exit. API providers and
council agents own no long-lived package process.
