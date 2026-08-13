# Internet — Implemented Layout

```text
packages/internet/
├── package.json
├── README.md
├── CHANGELOG.md
├── docs/
├── scripts/
├── src/
│   ├── extension.ts
│   ├── hooks.ts
│   ├── index.ts
│   ├── settings.ts
│   ├── accounts/registry.ts
│   ├── daemon/
│   │   ├── config.ts
│   │   ├── doctor.ts
│   │   ├── health.ts
│   │   ├── harness.ts
│   │   ├── manager.ts
│   │   └── runtime.ts
│   ├── backends/openai/
│   │   ├── provider.ts
│   │   ├── models.ts
│   │   ├── daemon/{auth,client,routes,status}.ts
│   │   └── turn/{files,model,request}.ts
│   ├── core/{errors,types}.ts
│   ├── tools/{accounts,compact,control,daemon,doctor,harness,register,settings,status,web}.ts
│   └── web/{fetch,search}.ts
├── test/                       # mirrors package-owned source responsibilities
├── vendor/codex-chatgpt-web/
│   ├── SNAPSHOT.md
│   ├── LICENSE
│   ├── package.json
│   ├── bun.lock
│   ├── scripts/build-runtime-bundle.ts
│   └── src/                    # fixed daemon MVP snapshot
└── dist/                       # gitignored build output
    ├── daemon/*.js             # package-owned lifecycle modules
    └── daemon/runtime/         # embedded Bun + daemon app + launcher
```

## Responsibilities

- `extension.ts`: composition root only.
- `accounts/registry.ts`: account routing metadata and atomic persistence.
- `daemon/config.ts`: package-owned private daemon/browser configuration.
- `daemon/runtime.ts`: bundled artifact resolution and platform validation.
- `daemon/doctor.ts`: bounded CLI diagnostics and strict report validation.
- `daemon/health.ts`: startup health polling.
- `daemon/harness.ts`: account-scoped Full-mode paths and private runtime-key storage.
- `daemon/manager.ts`: the single daemon/tunnel lifecycle owner.
- `backends/openai/provider.ts`: capability-scoped provider configuration and naming.
- `backends/openai/turn/files.ts`: bounded workspace-local `@file` expansion.
- `backends/openai/turn/request.ts`: pure daemon identity/environment payload adaptation.
- `hooks.ts`: provider-name-scoped readiness/adaptation gate plus approvals and HUD refresh.
- `settings.ts`: atomic private package settings.
- `backends/openai/daemon/*`: HTTP auth/client/status boundaries.
- `web/*`: public web transport with network and response safety checks.
- `tools/*`: direct Pi extension tools; no redundant custom context/tool abstraction.
- `vendor/*`: third-party fixed source snapshot, built by its own pinned Bun toolchain.

The vendor snapshot excludes upstream tests, docs, Electron launcher, generated output,
`node_modules`, and sync machinery. Its source is not reformatted into Pi style.

## Build workflow

```bash
npm run build   # package TypeScript + self-contained daemon runtime
npm test        # tests import the rebuilt dist
```
