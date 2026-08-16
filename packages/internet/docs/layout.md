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

`vendor/runtime/` is a Pi-owned browser-backed inference runtime. Its provider-neutral root contains
only process, configuration-path, service, HTTP-hosting, and bounded I/O primitives. The ChatGPT Web
adapter owns the OpenAI Responses protocol and every browser/provider concern. See the canonical
[provider-neutral runtime boundary review](review/daemon-boundary.md).

### Core (`vendor/runtime/src/`)

```text
config.ts               # runtime home, atomic writes, durable command validation
event-queue.ts          # bounded async event queue
http-body.ts            # bounded request decoding
process.ts              # process probing and command execution
server.ts               # provider-neutral Bun HTTP host
service.ts              # daemon process and drain lifecycle
version.ts              # runtime version
cli.ts                  # composition root
```

### ChatGPT adapter (`vendor/runtime/src/adapters/chatgpt-web/`)

```text
adapter.ts / turn-adapter.ts
                        # ChatGPT turn adapter and its internal event contract
server.ts               # ChatGPT routes, health, control, and idle shutdown
config.ts / setup.ts / doctor.ts
                        # ChatGPT configuration and lifecycle orchestration
responses/              # OpenAI Responses parsing, state, SSE, and error mapping
types.ts                # adapter request, event, content, and usage types
browser-worker.ts       # browser lifecycle, page interaction, turn execution
browser-login.ts / login-state.ts
                        # authenticated ChatGPT login and filtered browser state
session.ts / models.ts / model-catalog.ts
                        # ChatGPT account and model capabilities
prompt.ts / markdown.ts / image.ts
                        # ChatGPT composer and content conversion
conversation-*.ts       # durable ChatGPT conversation state and synchronization
turn-*.ts / mcp-*.ts    # tool broker, turn execution, and MCP bridge
wire-*.ts               # authenticated ChatGPT wire capture and parsing
tunnel.ts / tunnel-service.ts
                        # adapter-owned connector tunnel
native-passthrough.ts   # adapter backend passthrough
web-search/             # adapter synthetic search tool
```

`cli.ts` is the sole composition root permitted to import the ChatGPT adapter. Neutral runtime
modules do not import adapter modules. Upstream Codex route mutation, journal migration, and legacy
route CLI commands were removed.
