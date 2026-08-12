# Internet — Implemented Layout

The package uses the smallest layout that represents the current MVP. Deferred backends and a
custom Responses stream adapter are intentionally absent.

```
packages/internet/
├── package.json
├── tsconfig.build.json
├── vitest.config.ts
├── README.md
├── CHANGELOG.md
├── docs/
├── src/
│   ├── extension.ts
│   ├── hooks.ts
│   ├── index.ts
│   ├── version.ts
│   ├── accounts/
│   │   └── registry.ts
│   ├── backends/openai/
│   │   ├── index.ts
│   │   ├── models.ts
│   │   ├── provider.ts
│   │   ├── daemon/
│   │   │   ├── auth.ts
│   │   │   ├── client.ts
│   │   │   ├── routes.ts
│   │   │   └── status.ts
│   │   └── turn/
│   │       └── model.ts
│   ├── core/
│   │   ├── errors.ts
│   │   └── types.ts
│   ├── tool/
│   │   ├── host.ts
│   │   ├── index.ts
│   │   └── spec.ts
│   └── tools/
│       ├── accounts.ts
│       ├── compact.ts
│       ├── control.ts
│       ├── register.ts
│       └── status.ts
├── test/                   # mirrors retained source responsibilities
└── dist/                   # gitignored build output
```

## Responsibilities

- `extension.ts`: translates Pi's `ExtensionContext` into the narrow `InternetContext`, registers
  providers/tools/hooks/HUD.
- `accounts/registry.ts`: validates and atomically persists account routing metadata.
- `backends/openai/provider.ts`: creates and registers Pi `openai-responses` providers.
- `backends/openai/models.ts`: canonical Sol/Luna model metadata.
- `backends/openai/daemon/auth.ts`: secure daemon config and control-token handling.
- `backends/openai/daemon/client.ts`: typed health, compaction, and control HTTP calls.
- `backends/openai/daemon/status.ts`: non-throwing status snapshot and HUD projection.
- `tools/*`: narrow TypeBox tool surfaces over accounts and the daemon client.
- `hooks.ts`: future bridged-tool approval guard and HUD refresh.

## Removed scaffold seams

The initial scaffold included Anthropic/Google folders and custom turn adapter/replay files. They
were removed because they had no current behavior and would duplicate Pi/daemon responsibilities.
Future backends should add concrete modules and matching tests only when implemented.

## Package integration

The package manifest exposes `dist/extension.js` through the `pi.extensions` field. Internal imports
use `#internet/*`; tests use `#internet-test/*`. Tests import built `dist`, so the required workflow
is:

```bash
npm run build
npm test
```
