# Internet — Pi Ecosystem Integration

How the `internet` package plugs into the current Pi ecosystem, using the exact extension APIs and
conventions present in this monorepo (`packages/pi`, `packages/agent`, `packages/workflows`).

> **Source:** the Pi host APIs live in `/home/superman/workspaces/pi/packages/pi/src`
> (`api/extension-types.ts`, `tool/spec.ts`, `api/provider-types.ts`, `hooks/api.ts`,
> `hooks/events.ts`, `loader/extensions/loader.ts`) and `packages/ai/src/provider/openai/responses/`.
> See [source-repositories.md](source-repositories.md).

---

## 1. The extension contract

Pi loads a package's **default export** and calls it with the `ExtensionAPI`. The `internet`
package exports a factory of type `ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>`.

```ts
// src/extension.ts
import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { registerInternetTools } from "./tools/register";
import { registerInternetHooks } from "./hooks";

export default function internetExtension(pi: ExtensionAPI): void {
  registerInternetTools(pi); // tools
  registerInternetHooks(pi); // hooks
  pi.registerHudProvider(readDaemonStatus); // HUD
}
```

### Available `ExtensionAPI` surfaces (from `packages/pi/src/api/extension-types.ts`)

| Surface | Method | What internet uses it for |
|---------|--------|---------------------------|
| Tools | `registerTool`, `refreshTools`, `getAllTools`, `setActiveTools` | Register `internet_status`, `internet_compact`, `internet_control`, `internet_accounts` (MVP). Post-MVP adds `codex_tool_call` / `codex_exec`. |
| Commands | `registerCommand` | Slash commands like `/internet` to run a turn or show status. |
| Hooks | `ExtensionAPI extends ExtensionHookAPI` → `on(...)` | `tool_call` guard, `turn_end` bookkeeping. |
| HUD | `registerHudProvider` | Live daemon status line (active turns, draining). |
| Shortcuts | `registerShortcut` | Keybinding to open the daemon status panel. |
| Flags | `registerFlag` / `getFlag` | User knobs: `autoApproveTools`, `mode`, `endpoint`. |
| Providers | `registerProvider` | Register ChatGPT Web as a model provider (see §4). |
| Messages | `sendMessage` / `sendUserMessage` | Push a completed-turn notification back to the agent. |
| Sessions | `setSessionName`, `appendEntry` | Track which thread/session a turn belongs to. |

---

## 2. Hooks: the approval gate

The bridge's strongest control — a human approving tool access before a model turn runs — maps
directly to Pi's `tool_call` hook. Pi's `ToolCallEventResult` allows `{ block?: boolean, reason?:
string }`:

```ts
// src/hooks.ts
import type { ExtensionAPI } from "@tsuuanmi/pi";

export function registerInternetHooks(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "codex_tool_call" && event.toolName !== "codex_exec") return undefined;
    const auto = pi.getFlag("autoApproveTools") === true;
    const allowed = auto ? true : await confirmConnectorUse(ctx);
    return allowed ? undefined : { block: true, reason: "connector use not approved" };
  });

  pi.on("turn_end", async () => {
    // refresh HUD status after every turn
  });
}
```

This mirrors `autoApproveToolCalls=false` in the daemon: the model stays untrusted, and a bridged
native tool cannot run without policy approval.

---

## 3. Model provider registration (the MVP core)

`internet` registers ChatGPT Web as a Pi model provider via `registerProvider(name, config)`. This
lets the agent select `gpt-5.6-sol` / `gpt-5.6-luna` as its model and route inference through the
bridge. The provider config is the same shape the daemon already builds (`providerConfig` in
`codex-chatgpt-web/src/config.ts`):

```ts
pi.registerProvider("chatgpt-web", {
  adapter: "chatgpt-web",
  baseUrl: "https://chatgpt.com",
  models: ["gpt-5.6-sol", "gpt-5.6-luna"],
  liveModels: false,
  // ...contextWindow, modelInputModalities, reasoning efforts
});
```

This is the **primary** MVP path (see review-and-brainstorm.md); the tools are a thin surface around
it.

---

## 4. Subagent and long-running work

The `team`/`ultragoal` skills in `packages/workflows` show the pattern for long-running work: a
tool's `execute` returns a **receipt** while a durable subagent keeps the turn alive. `internet`
can use the same shape for long-running inference — the result is delivered asynchronously via
`sendMessage` when the bridge completes.

---

## 5. HUD integration

`registerHudProvider` returns a status-line entry. `internet` renders:

```
internet · 2 active turns · draining:off · mode:full
```

It reads the daemon `/healthz` snapshot. This mirrors how `packages/workflows` registers its HUD
provider in its extension entry.

---

## 6. Discovery and loading

Pi discovers packages two ways (see `packages/pi/src/resources/discovery.ts` and the settings
docs):

1. **Auto-discovery**: build `internet` into the Pi monorepo and let Pi's package manifest pick it
   up (the `workflows` package does this).
2. **Explicit `extensions` setting** (`packages/pi/docs/settings/index.md`):

```jsonc
{
  "extensions": ["./packages/internet", "@tsuuanmi/pi-internet"]
}
```

After any `src/` change, rebuild the package (`npm run build` in the package dir) because Pi loads
from `dist/`.

---

## 7. Boundary rules

Following the repo's package-boundary conventions (`packages/workflows/docs/...`):

- `internet` imports **only public** `@tsuuanmi/pi*` entry points — never `#pi/*` internals or
  `@tsuuanmi/pi/*` internal paths.
- The package graph stays **one direction**: `internet` depends on `@tsuuanmi/pi`; Pi does not
  depend on `internet`. No cycles.
- `src/`, `docs/`, and `test/` layouts stay consistent; when `src/` gains a folder, mirror it in
  `docs/` and `test/`.
- The model stays untrusted: authority comes from the trusted environment and per-turn tool
  registry, never from model output.

---

## 8. What the agent can now do (MVP)

With `internet` loaded, a Pi agent gains:

- **ChatGPT Web model routing** via `registerProvider` (`gpt-5.6-sol` / `gpt-5.6-luna`);
- run **compaction** (`internet_compact`) to keep long tasks inside the context window;
- **control the daemon** (`internet_control`: drain / resume / shutdown / status);
- a **HUD status line** with live turn counts;
- **multi-account** management (`internet_accounts`, ...).

Post-MVP (full-mode tool bridge, see review-and-brainstorm.md):
- bridge **native Codex tools** into a turn (`codex_tool_call`, `codex_exec`, `codex_apply_patch`);
- the **connector approval gate** enforced through the `tool_call` hook.
