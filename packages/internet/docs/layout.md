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
│   │   ├── gemini-web/{models,provider}.ts
│   │   └── openai/{index,models,provider,turn/}
│   ├── council/service.ts
│   ├── core/{errors,types}.ts
│   ├── daemon/{auth,client,config,doctor,harness,health,manager,routes,runtime,status}.ts
│   ├── tools/{accounts,compact,control,conversations,council,daemon,doctor,harness,register,settings,status,web}.ts
│   ├── web/{fetch,search}.ts
│   ├── extension.ts
│   ├── hooks.ts
│   ├── index.ts
│   ├── settings.ts
├── test/                    # mirrors changed src areas
├── docs/                    # mirrors src modules plus architecture, usage, and future-work docs
├── scripts/build-daemon.mjs
└── runtime/
```

`dist/daemon/runtime/` is generated, ignored build output. It contains the native launcher, schema-1
host manifest, bundled application payload, runtime Bun executable, and license. It is copied from
`runtime/` by `scripts/build-daemon.mjs`; source modules are never imported by the parent
extension at runtime.

## Runtime boundary

`runtime/` is a Pi-owned browser-backed inference runtime. Its `core/` directory contains
only provider-neutral process, configuration, protocol contracts, provider composition,
HTTP-hosting, and bounded-I/O primitives. ChatGPT Web and Gemini Web are organized by feature and
own their provider policy. All browser-facing code lives under `runtime/src/browser/`; reusable
mechanics are direct modules and each browser provider has its own subdirectory.

### Core (`runtime/src/core/`)

```text
config.ts       # runtime home, atomic writes, durable command validation
event-queue.ts  # bounded async event delivery
http-body.ts    # bounded request decoding
process.ts      # process probing and command execution
protocol/       # normalized browser-provider request and event contracts
provider.ts     # explicit adapter factory registry
responses/      # provider-neutral Responses event projection used by Gemini Web
server.ts       # provider-neutral Bun HTTP host
service.ts      # daemon process and drain lifecycle
```

### Browser runtime (`runtime/src/browser/`)

```text
session.ts                  # browser/context/page ownership, leases, and cleanup
response-capture.ts         # provider-selected response capture lifecycle
turn.ts                     # turn admission, maintenance, deadlines, and cancellation
chatgpt-web/                # ChatGPT login, selectors, interactions, completion, and worker
gemini-web/                 # Gemini auth, capabilities, config, interactions, DOM streaming, and turns
```

### ChatGPT provider (`runtime/src/providers/chatgpt-web/`)

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

### Gemini Web provider (`runtime/src/providers/gemini-web/`)

```text
adapter.ts                  # normalized adapter and Pi-session conversation binding
config.ts                   # browser-only provider configuration
conversation/policy.ts      # immutable Pi-session-to-native-chat state
factory.ts                  # runtime composition
lifecycle/doctor.ts         # provider diagnostics
models.ts                   # capability-driven model routes
prompt.ts                   # text-only request policy and prompt compilation
request.ts                  # bounded Responses request parsing
server.ts                   # Gemini health, responses, cancellation, and shutdown routes
```

`cli.ts` is the sole composition root permitted to import concrete adapter factories. Neutral
runtime modules under `core/` do not import adapter modules. `browser/chatgpt-web/` and
`browser/gemini-web/` are explicit provider boundaries; direct modules in `browser/` remain
provider-neutral.
