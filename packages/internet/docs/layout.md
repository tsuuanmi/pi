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
The ChatGPT Web provider is organized by feature and owns the OpenAI Responses protocol plus
provider policy. Reusable browser lifecycle and capture mechanics live under `vendor/runtime/src/browser/`.
See the canonical [provider-neutral runtime boundary review](review/daemon-boundary.md) and the
[Browser and provider boundary review](review/browser-provider-boundary.md).

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
session.ts                  # browser/context/page ownership and cleanup
response-capture.ts         # provider-selected response capture lifecycle
```

### ChatGPT provider (`vendor/runtime/src/providers/chatgpt-web/`)

```text
adapter.ts                  # adapter entrypoint
adapter-error.ts             # adapter error classification
browser/                     # ChatGPT login, storage state, selectors, and provider worker
conversation/                # durable conversation journal, sync, and canary
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

The current `providers/chatgpt-web/browser/` directory still contains ChatGPT-specific browser
policy. The proposed split extracts reusable mechanics from that worker; it does not rename the
current provider-specific directory. See the
[Browser and provider boundary review](review/browser-provider-boundary.md).
