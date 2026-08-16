# Implemented Layout

```text
packages/internet/
├── src/
│   ├── accounts/registry.ts
│   ├── providers/
│   │   ├── provider.ts
│   │   ├── names.ts
│   │   ├── registry.ts
│   │   ├── anthropic/{index,models,provider}.ts
│   │   ├── google/{index,models,provider}.ts
│   │   └── openai/{index,models,provider,daemon/,turn/}
│   ├── council/service.ts
│   ├── core/{errors,types}.ts
│   ├── daemon/{config,doctor,harness,health,manager,runtime}.ts
│   ├── tools/{accounts,compact,control,conversations,council,daemon,doctor,harness,register,settings,status,web}.ts
│   ├── web/{fetch,search}.ts
│   ├── extension.ts
│   ├── hooks.ts
│   ├── index.ts
│   ├── settings.ts
│   └── version.ts
├── test/                    # mirrors changed src areas
├── docs/                    # mirrors src modules plus architecture/usage/review records
├── scripts/build-daemon.mjs
└── vendor/runtime/
```

`dist/daemon/runtime/` is generated, ignored build output. It contains the native launcher, schema-1
host manifest, bundled application payload, runtime Bun executable, and license. It is copied from
`vendor/runtime/` by `scripts/build-daemon.mjs`; source modules are never imported by the parent
extension at runtime.

## Runtime boundary

`vendor/runtime/` is a Pi-owned browser-backed inference runtime. Its `core/` directory contains
only provider-neutral process, configuration-path, service, HTTP-hosting, and bounded-I/O primitives.
The ChatGPT Web adapter is organized by feature and owns the OpenAI Responses protocol plus every
browser/provider concern. See the canonical [provider-neutral runtime boundary review](review/daemon-boundary.md).

### Core (`vendor/runtime/src/core/`)

```text
config.ts       # runtime home, atomic writes, durable command validation
event-queue.ts  # bounded async event delivery
http-body.ts    # bounded request decoding
process.ts      # process probing and command execution
server.ts       # provider-neutral Bun HTTP host
service.ts      # daemon process and drain lifecycle
version.ts      # runtime version
```

### ChatGPT adapter (`vendor/runtime/src/adapters/chatgpt-web/`)

```text
adapter.ts                  # adapter entrypoint
adapter-error.ts             # adapter error classification
browser/                     # login, storage state, browser worker, session, concurrency
conversation/                # durable conversation journal, sync, canary, checkpoints
content/                     # prompts, markdown, images, token and usage accounting
lifecycle/                   # provider config, setup, doctor, connector and control
models/                      # model routes and catalog projection
protocol/                    # adapter types and OpenAI Responses parsing/projection
protocol/responses/          # schema, parser, state, compaction, SSE, errors
server/                     # ChatGPT routes, health, control and idle shutdown
tools/                      # MCP bridge and synthetic web search
transport/                  # tunnel, wire capture/response and native passthrough
turn/                       # turn adapter, browser environment, broker and execution
```

`cli.ts` is the sole composition root permitted to import the ChatGPT adapter. Neutral runtime
modules under `core/` do not import adapter modules. Upstream Codex route mutation, journal
migration, and legacy route CLI commands were removed.
