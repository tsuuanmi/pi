# Internet — Suggested Layout

The proposed `packages/internet/` source tree follows the Pi monorepo conventions used by
`packages/workflows`: a package root with `package.json`, a `src/` tree, a `docs/` tree, and a
`dist/` build output. This mirrors the "keep `src/`, `docs/`, `test/` layouts consistent" rule.

---

## 1. Package root

```
packages/internet/
├── package.json
├── tsconfig.build.json
├── README.md
├── src/
├── docs/
│   ├── index.md
│   ├── architecture.md
│   ├── layout.md            (this file)
│   ├── how-it-works.md
│   └── pi-integration.md
├── test/
└── dist/                    # gitignored build output
```

---

## 2. `src/` tree

The tree below is the **mature** layout. It separates the **core domain contracts** (ported from
codex-chatgpt-web) from the **per-backend adapters** (openai / anthropic / google), the **account
registry**, and the **cross-backend tools**. The MVP uses the `openai` backend only; `anthropic` and
`google` are stubbed seams that stay additive.

```
src/
├── extension.ts            # default export — wired into Pi (ExtensionFactory)
├── index.ts                # public API re-exports
├── version.ts
├── core/                   # backend-agnostic domain contracts (ported from codex-chatgpt-web)
│   ├── types.ts            # CodexParsedRequest, CodexContext, CodexMessage, AdapterEvent, CodexUsage
│   ├── adapter.ts          # ProviderAdapter interface (runTurn / emit)
│   └── errors.ts           # adapter error classification (status/type/code/retryable)
├── backends/
│   ├── backend.ts          # InternetBackend seam (providerName/api/register/accounts)
│   ├── openai/             # MVP backend — ChatGPT Web via the codex-chatgpt-web daemon
│   │   ├── index.ts        # OpenAI backend entry (register)
│   │   ├── provider.ts     # pi.registerProvider("chatgpt-web", ...) — the MVP core
│   │   ├── models.ts       # gpt-5.6-sol / gpt-5.6-luna model definitions
│   │   ├── daemon/
│   │   │   ├── client.ts   # HTTP client over the daemon's Responses routes
│   │   │   ├── routes.ts   # endpoint paths + request/response types
│   │   │   ├── auth.ts     # Bearer control-token handling (read 0600 file)
│   │   │   └── status.ts   # /healthz parsing + HUD snapshot
│   │   └── turn/
│   │       ├── adapter.ts  # Pi tool call → Responses request → SSE→tool output
│   │       ├── model.ts    # model/effort resolution (sol/luna/pro caps)
│   │       └── replay.ts   # thread-keyed dedup/replay of settled turns
│   ├── anthropic/          # FUTURE backend — Claude (stub)
│   │   ├── index.ts
│   │   ├── provider.ts     # pi.registerProvider("claude", ...) — anthropic-messages
│   │   └── models.ts
│   └── google/             # FUTURE backend — Gemini (stub)
│       ├── index.ts
│       ├── provider.ts     # pi.registerProvider("gemini", ...) — openai-completions compat
│       └── models.ts
├── accounts/
│   └── registry.ts         # account registry (id/backend/displayName/port/configDir/enabled)
├── tools/                  # cross-backend tools
│   ├── register.ts         # registerInternetTools(host)
│   ├── accounts.ts         # internet_accounts / internet_account_add / enable / disable
│   ├── status.ts           # internet_status (daemon health/turns)
│   ├── control.ts          # drain / resume / shutdown tools
│   └── compact.ts          # internet_compact (context summarization)
├── hooks.ts                # registerInternetHooks(host) — tool_call guard, turn_end
└── tool/
    ├── host.ts             # InternetToolHost (registerTool)
    └── spec.ts             # InternetToolSpec (TypeBox params + details)
```

---

## 3. Key files, concretely

### 3.1 `src/extension.ts`

The default export Pi loads. Pi calls it with the `ExtensionAPI` (`@tsuuanmi/pi/extensions`). Because
`ExtensionAPI` exposes `registerTool`, it structurally satisfies `InternetToolHost`, so the register
functions and hooks take `pi` directly:

```ts
import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { registerInternetTools } from "./tools/register";
import { registerInternetHooks } from "./hooks";
import { readDaemonStatus } from "./backends/openai/daemon/status";

export default function internetExtension(pi: ExtensionAPI): void {
  registerInternetTools(pi); // each register*Tools(host) accepts InternetToolHost; ExtensionAPI satisfies it
  registerInternetHooks(pi); // hooks via pi.on(...)
  pi.registerHudProvider(readDaemonStatus);
}
```

`readDaemonStatus` lives in the `openai` backend (`backends/openai/daemon/status.ts`); the MVP HUD
reads the daemon `/healthz` snapshot. If the HUD later spans multiple backends, move it to a
cross-backend module.

### 3.2 `src/tool/host.ts`

The narrow registration surface used by every tool module:

```ts
import type { TSchema } from "typebox";

export interface InternetToolHost {
  registerTool<TParams extends TSchema = TSchema, TDetails = unknown>(
    tool: InternetToolSpec<TParams, TDetails>,
  ): void;
}
```

### 3.3 `src/tools/register.ts`

Aggregates the **MVP** per-feature registration (mirrors `packages/workflows/src/tool/register.ts`).
It registers only the tools in the §2 tree and the MVP scope — **not** the post-MVP tool bridge
(`codex-tool-call`, `codex-exec`, `codex-apply-patch`):

```ts
import type { InternetToolHost } from "../tool/host";
import { registerAccountsTools } from "./accounts";
import { registerStatusTools } from "./status";
import { registerControlTools } from "./control";
import { registerCompactTools } from "./compact";

export function registerInternetTools(host: InternetToolHost): void {
  registerAccountsTools(host);
  registerStatusTools(host);
  registerControlTools(host);
  registerCompactTools(host);
}
```

When the **full-mode tool bridge** lands (post-MVP), add `codex-tool-call` and `codex-exec` here;
they are intentionally absent from the MVP.

### 3.4 `src/tools/status.ts` (the MVP tool surface)

The MVP exposes a thin tool surface on top of provider model routing. `status.ts` reads the daemon
`/healthz` snapshot via the `openai` backend's daemon client:

```ts
import { T } from "@sinclair/typebox";
import type { InternetToolHost } from "../tool/host";

export function registerStatusTools(host: InternetToolHost): void {
  host.registerTool({
    name: "internet_status",
    description: "Show the local ChatGPT Web daemon health and active turns.",
    params: T.Object({}),
    details: { destructive: false, openWorld: false },
    async execute(_params, ctx) {
      const client = daemonClient(ctx);
      return client.health();
    },
  });
}
```

`daemonClient(ctx)` resolves the `openai` backend's `backends/openai/daemon/client.ts`. The MVP's
primary path is **provider model routing** per review-and-brainstorm.md; the tools (`internet_status`,
`internet_compact`, `internet_control`, `internet_accounts`) are a thin surface around it.

---

## 4. `package.json`

Modeled on `packages/workflows/package.json`:

```jsonc
{
  "name": "@tsuuanmi/pi-internet",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./extension": { "types": "./dist/extension.d.ts", "import": "./dist/extension.js" },
    "./tool": { "types": "./dist/tool/index.d.ts", "import": "./dist/tool/index.js" },
    "./hooks": { "types": "./dist/hooks.d.ts", "import": "./dist/hooks.js" },
    "./runtime/*": { "types": "./dist/runtime/*.d.ts", "import": "./dist/runtime/*.js" },
    "./package.json": "./package.json"
  },
  "scripts": {
    "clean": "shx rm -rf dist",
    "build": "npm run clean && tsgo -p tsconfig.build.json",
    "test": "vitest --run"
  }
}
```

---

## 5. `tsconfig.build.json`

Follows `packages/workflows/tsconfig.build.json`: `noEmit:false`, `outDir:./dist`,
`rootDir:./src`, and `paths` mapping `#internet/* → ./src/*` plus the `@tsuuanmi/pi*` package types.

---

## 6. `test/` mirror

Keep `test/` parallel to `src/`:

```
test/
├── core/
│   ├── types.test.ts
│   └── adapter.test.ts
├── backends/
│   ├── backend.test.ts
│   ├── openai/
│   │   ├── provider.test.ts
│   │   ├── models.test.ts
│   │   ├── daemon/
│   │   │   ├── client.test.ts
│   │   │   ├── routes.test.ts
│   │   │   ├── auth.test.ts
│   │   │   └── status.test.ts
│   │   └── turn/
│   │       ├── adapter.test.ts
│   │       ├── model.test.ts
│   │       └── replay.test.ts
│   ├── anthropic/
│   │   ├── provider.test.ts
│   │   └── models.test.ts
│   └── google/
│       ├── provider.test.ts
│       └── models.test.ts
├── accounts/
│   └── registry.test.ts
├── tools/
│   ├── accounts.test.ts
│   ├── status.test.ts
│   ├── control.test.ts
│   └── compact.test.ts
└── hooks.test.ts
```

Tests import from `dist/` (per the monorepo rule), so `npm run build` must run before `vitest`.

---

## 7. Pi package "link" standard

To be loadable by Pi, the package follows the same standard as `packages/workflows`:

### 7.1 `pi` manifest field in `package.json`

Pi reads a `pi` field in `package.json` (`packages/pi/src/resources/manifest.ts`) to discover which
resources to load. `internet` declares its extension:

```jsonc
"pi": {
  "extensions": ["dist/extension.js"]
}
```

### 7.2 Default-export extension factory

Pi loads the extension module and calls its **default export** as an `ExtensionFactory`
(`packages/pi/src/loader/extensions/loader.ts`):

```ts
// src/extension.ts
export default function internetExtension(pi: ExtensionAPI): void { ... }
```

### 7.3 `imports` path aliases

The package declares `#internet/*` (and `#internet-test/*`) so internal imports resolve to `dist/`
and tests resolve to `test/` — mirroring `packages/workflows`:

```jsonc
"imports": {
  "#internet/*": { "types": "./dist/*.d.ts", "import": "./dist/*.js" },
  "#internet-test/*": { "types": "./test/*.ts", "import": "./test/*.ts" }
}
```

### 7.4 `engines` + `types`

```jsonc
"engines": { "node": ">=22.19.0" },
"types": "./dist/index.d.ts"
```

### 7.5 Linking into Pi

Two ways (see `packages/pi/docs/settings/index.md`):

1. **Auto-discovery** — build into the Pi monorepo; Pi's package manifest picks it up (like
   `workflows`).
2. **Explicit `packages`/`extensions` setting** — add to Pi settings:

```jsonc
{
  "packages": ["@tsuuanmi/pi-internet"],
  "extensions": ["./packages/internet"]
}
```

After any `src/` change, rebuild (`npm run build` in the package dir) because Pi loads from `dist/`.

### 7.6 Boundary rules

- `internet` imports **only public** `@tsuuanmi/pi*` entry points — never `#pi/*` internals.
- The package graph stays **one direction**: `internet` depends on `@tsuuanmi/pi`; Pi does not
  depend on `internet`. No cycles.
- `src/`, `docs/`, `test/` layouts stay consistent.
