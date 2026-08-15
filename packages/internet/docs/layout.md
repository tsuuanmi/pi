# Implemented Layout

```text
packages/internet/
├── src/
│   ├── accounts/registry.ts
│   ├── backends/
│   │   ├── backend.ts
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
└── vendor/codex-chatgpt-web/
```

`dist/daemon/runtime/` is generated, ignored build output. It contains a native launcher, schema-1
host manifest, source maps/application payload, license, snapshot record, and third-party notices.
Vendored source is the only browser automation implementation; package modules own lifecycle and
provider composition rather than duplicating it.
