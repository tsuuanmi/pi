# Development

See [AGENTS.md](https://github.com/tsuuanmi/pi/blob/main/AGENTS.md) for repository contribution and verification guidelines.

## Setup

```bash
git clone https://github.com/tsuuanmi/pi
cd pi
npm install
npm run build
```

Run the CLI from source:

```bash
npx tsx packages/pi/src/cli/cli.ts --help
```

Run Pi's package tests with:

```bash
npm run test --workspace @tsuuanmi/pi
```

The CLI keeps the caller's current working directory.

## Forking and rebranding

Pi reads its display name and configuration directory from the package's `piConfig` metadata:

```json
{
  "piConfig": {
    "name": "pi",
    "configDir": ".pi"
  }
}
```

Change `name`, `configDir`, and the `bin` field for a fork. The configured name affects the CLI banner and the names of agent and session directory environment variables.

## Path resolution

Supported package paths are npm installs and running from source with `tsx`. Standalone compiled binaries are not produced.

Use `src/loader/config.ts` for package assets:

```typescript
import { getPackageDir } from "./loader/config.js";
```

Do not use `__dirname` directly for package assets.

## Testing

```bash
npm run test --workspace @tsuuanmi/pi
npm run test --workspace @tsuuanmi/pi -- test/specific.test.ts
```

## Source structure

The source tree is organized by runtime boundary. This documentation uses the same top-level names:

```
packages/pi/src/
  cli/                   # CLI entry point and command-line modules
  config.ts              # configuration value helpers
  main.ts                # startup and mode dispatch
  index.ts               # public package exports
  agent/                 # agent profile definitions and system prompts
  api/                   # public API and extension-facing types
  app/                   # startup, runtime, session, and mode orchestration
  auth/                  # authentication storage and provider guidance
  cli/                   # argument parsing and CLI helpers
  execution/             # command and shell execution
  extensions/            # extension loading, hooks, registry, and runner
  loader/                # package paths, configuration, and resource loading
  modes/                 # interactive, print, JSON, and RPC modes
  network/               # HTTP transport configuration
  output/                # output buffering, sanitization, and truncation
  package/               # package discovery, installation, and diagnostics
  resources/              # resource records and diagnostics
  runtime/                # agent-session services, context, prompts, and stats
  session/                # session persistence, layout, and compaction
  settings/               # settings and keybinding management
  tools/                  # built-in tools and LSP support
  ui/                     # interactive components
    package/              # package configuration UI
```

See [Application flow](index.md) for the startup sequence and [Resource loader](../loader/index.md) for filesystem and package discovery boundaries.

The other workspace packages provide shared layers: `packages/ai` contains model protocols and providers, `packages/agent` contains the agent loop and message types, and `packages/tui` contains terminal UI primitives.
