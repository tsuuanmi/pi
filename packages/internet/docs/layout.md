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
├── test/                    # mirrors changed src areas
├── docs/                    # mirrors src modules plus architecture, usage, and future-work docs
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
The ChatGPT Web provider is organized by feature and owns the OpenAI Responses protocol plus
provider policy. All browser-facing code lives under `vendor/runtime/src/browser/`; reusable
mechanics are direct modules and ChatGPT browser behavior has its own subdirectory.

### Core (`vendor/runtime/src/core/`)

```text
config.ts       # runtime home, atomic writes, durable command validation
event-queue.ts  # bounded async event delivery
http-body.ts    # bounded request decoding
process.ts      # process probing and command execution
server.ts       # provider-neutral Bun HTTP host
service.ts      # daemon process and drain lifecycle
```

### Browser runtime (`vendor/runtime/src/browser/`)

```text
session.ts                  # browser/context/page ownership, leases, and cleanup
response-capture.ts         # provider-selected response capture lifecycle
turn.ts                     # turn admission, maintenance, deadlines, and cancellation
chatgpt-web/                # ChatGPT login, selectors, interactions, completion, and worker
```

### ChatGPT provider (`vendor/runtime/src/providers/chatgpt-web/`)

```text
adapter.ts                  # adapter entrypoint
adapter-error.ts             # adapter error classification
conversation/                # durable conversation journal, sync, and canary
content/                     # prompts, markdown, images, token and usage accounting
lifecycle/                   # provider config, setup, doctor, connector and control
models/                      # model routes and catalog projection
protocol/                    # adapter types and OpenAI Responses parsing/projection
protocol/responses/          # schema, parser, state, compaction, SSE, errors
server/                     # ChatGPT routes, health, control and idle shutdown
tools/                      # MCP bridge and synthetic web search
transport/                  # tunnel, wire-response parsing and native passthrough
turn/                       # turn adapter, browser environment, broker and execution
```

`cli.ts` is the sole composition root permitted to import the ChatGPT adapter. Neutral runtime
modules under `core/` do not import adapter modules. Upstream Codex route mutation, journal
migration, and legacy route CLI commands were removed.

`browser/chatgpt-web/` is the explicit provider-specific browser boundary. Direct modules in
`browser/` remain provider-neutral.
