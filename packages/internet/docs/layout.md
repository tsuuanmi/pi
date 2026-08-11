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
├── skill.ts                # skill metadata / discovery glue
├── skills/
│   └── codex-turn/
│       ├── SKILL.md
│       └── tools.ts        # registerCodexTurnTools(host)
└── tool/
    ├── host.ts             # InternetToolHost (registerTool)
    └── spec.ts             # InternetToolSpec (TypeBox params + details)
```

---

## 3. Key files, concretely

### 3.1 `src/extension.ts`

The default export Pi loads. Mirrors `packages/workflows/src/extension.ts`:

```ts
import type { StatusLineHudEntryReader } from "@tsuuanmi/pi-tui";
import { registerInternetTools, type InternetToolHost } from "./tools/register";
import { registerInternetHooks } from "./hooks";
import { readDaemonStatus } from "./daemon/status";

export interface InternetHost extends InternetToolHost {
  registerHudProvider(provider: StatusLineHudEntryReader): void;
}

export default function internetExtension(host: InternetHost): void {
  registerInternetTools(host);
  registerInternetHooks(host);
  host.registerHudProvider(readDaemonStatus);
}
```

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

Aggregates per-feature registration (mirrors `packages/workflows/src/tool/register.ts`):

```ts
import { registerCodexTurnTools } from "../skills/codex-turn/tools";
import { registerCodexToolCallTool } from "./codex-tool-call";
import { registerCodexExecTool } from "./codex-exec";
import { registerCodexCompactTool } from "./codex-compact";
import { registerControlTools } from "./control";

export function registerInternetTools(host: InternetToolHost): void {
  registerCodexTurnTools(host);
  registerCodexToolCallTool(host);
  registerCodexExecTool(host);
  registerCodexCompactTool(host);
  registerControlTools(host);
}
```

### 3.4 `src/tools/codex-turn.ts`

The core tool. It builds a Responses payload and streams the result:

```ts
import { T } from "@sinclair/typebox";

const codexTurnParams = T.Object({
  prompt: T.String({ minLength: 1 }),
  model: T.Optional(T.String()),
  stream: T.Optional(T.Boolean({ default: true })),
});

export function registerCodexTurnTools(host: InternetToolHost): void {
  host.registerTool({
    name: "codex_turn",
    description: "Run a Codex turn through the local ChatGPT Web bridge.",
    params: codexTurnParams,
    details: { destructive: false, openWorld: true },
    async execute(params, ctx) {
      const client = daemonClient(ctx);
      return client.streamResponses({ model: params.model ?? "gpt-5.6-sol", input: [{ type: "input_text", text: params.prompt }], stream: true });
    },
  });
}
```

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
    "build": "npm run clean && tsgo -p tsconfig.build.json && npm run copy-assets",
    "copy-assets": "node scripts/copy-assets.mjs",
    "test": "vitest --run"
  }
}
```

The `copy-assets` step copies `src/skills/**/SKILL.md` into `dist/` so the skill is loadable from
the built package.

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
resources to load. `internet` declares its extension and skill:

```jsonc
"pi": {
  "extensions": ["dist/extension.js"],
  "skills": ["dist/skills/**/SKILL.md"]
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
