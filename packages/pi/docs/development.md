# Development

See [AGENTS.md](https://github.com/tsuuanmi/pi/blob/main/AGENTS.md) for additional guidelines.

## Setup

```bash
git clone https://github.com/tsuuanmi/pi
cd pi
npm install
npm run build
```

Run the CLI from source:

```bash
npx tsx packages/pi/src/cli.ts --help
```

Run Pi's package tests with:

```bash
npm run test --workspace @tsuuanmi/pi
```

The CLI keeps the caller's current working directory.

## Forking / Rebranding

Configure via `package.json`:

```json
{
  "piConfig": {
    "name": "pi",
    "configDir": ".pi"
  }
}
```

Change `name`, `configDir`, and `bin` field for your fork. Affects CLI banner, config paths, and environment variable names.

## Path Resolution

Supported package paths: npm install and tsx from source. Standalone compiled binaries are not produced.

**Always use `src/loader/config.ts`** for package assets:

```typescript
import { getPackageDir } from "./loader/config.js";
```

Never use `__dirname` directly for package assets.

## Testing

```bash
npm run test --workspace @tsuuanmi/pi
npm run test --workspace @tsuuanmi/pi -- test/specific.test.ts
```

## Source Structure

The Pi package is implemented under `packages/pi/src/`:

```
packages/pi/src/
  cli.ts                 # CLI entry point
  main.ts                # startup and mode dispatch
  index.ts               # public package exports
  migrations.ts          # startup migrations
  agent/                 # agent profile definitions and loading
  api/                   # public API and extension-facing types
  app/                   # startup, runtime, session, and mode orchestration
  auth/                  # authentication storage and guidance
  cli/                   # argument parsing and CLI helpers
  execution/             # command and shell execution
  loader/                # package paths, configuration, and resource loading
  model/                 # model registry, resolution, and thinking levels
  modes/                 # interactive, print, and RPC modes
  network/               # HTTP transport configuration
  output/                # output buffering, sanitization, and truncation
  package-manager/       # package discovery, installation, and diagnostics
    extensions/          # extension loading, hooks, registry, and runner
  runtime/               # AgentSession, runtime services, context, stats, prompt and skill expansion
  session/               # session persistence, layout, and compaction
  settings/              # settings and keybinding management
  subagents/             # subagent orchestration and tmux workers
  telemetry/             # API usage logging
  tools/                 # built-in tools and LSP support
  ui/                    # interactive components and package-manager UI
```

The other workspace packages provide shared layers: `packages/ai` contains model protocols and providers, `packages/agent` contains the agent loop and message types, and `packages/tui` contains terminal UI primitives.
