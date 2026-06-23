# Pi Codebase Overview

`pi` is a self-extensible, terminal-native AI coding agent harness. It is a
TypeScript monorepo built with npm workspaces and the TypeScript native
preview compiler (`tsgo`). Node `>=22.19.0` is required. All packages share one
lockstep version (currently `0.79.6`) and are released together.

- Repository: `git@github.com:tsuuanmi/pi.git` (local origin; upstream
  issue/PR links reference `earendil-works/pi-mono`).
- License: MIT. Author: Mario Zechner.
- Website: https://pi.dev — Docs: https://pi.dev/docs/latest
- Toolchain: `tsgo` (`@typescript/native-preview` 7.0.0-dev) for emit, Biome
  2.3.5 for lint/format, Vitest 3.2.6 for tests, esbuild 0.28.1, Bun for binary
  compilation, Husky 9.1.7 git hooks, Knip 6.17.1 dead-code, shx 0.4.0,
  TypeScript 5.9.3.

## Repository layout

```
.
├── AGENTS.md              # development rules (git, deps, commits, testing, release)
├── README.md
├── package.json           # root workspace manifest + cross-package scripts
├── tsconfig.base.json     # shared compiler options (Node16, strict, erasable syntax)
├── tsconfig.json          # root project with workspace path aliases
├── biome.json             # Biome 2.x lint/format config
├── knip.json              # dead-code / unused-export config
├── pi-test.sh             # local TUI smoke harness (used with tmux)
├── test.sh                # runs non-e2e vitest suites across packages
├── scripts/              # release, publish, dep-pinning, profiling, shrinkwrap, smoke (~5,187 LOC)
├── .github/              # CI workflows (build-binaries, npm trusted publishing)
├── .husky/               # git hooks (pre-commit lockfile guard)
├── .pi/                  # pi's own config/skills/workflow-state dir
└── packages/             # 4 workspace packages (+ 5 example extension workspaces)
    ├── ai/                # @earendil-works/pi-ai
    ├── agent/             # @earendil-works/pi-agent-core
    ├── coding-agent/      # @earendil-works/pi-coding-agent  (the `pi` CLI)
    └── tui/               # @earendil-works/pi-tui
```

Root workspaces: `packages/*` plus 5 example extensions declared as workspaces
(`with-deps`, `custom-provider-anthropic`, `custom-provider-gitlab-duo`,
`sandbox`, `gondolin`).

Root scripts (`package.json`): `build`, `check`, `check:browser-smoke`,
`check:pinned-deps`, `check:shrinkwrap`, `check:ts-imports`, `knip`,
`profile:tui`, `profile:rpc`, `test`, `version:{patch,minor,major}`,
`prepublishOnly`, `publish`, `publish:dry`, `release:local`,
`shrinkwrap:coding-agent`, `release:{patch,minor}`, `release:fix-links`,
`prepare`.

`scripts/`: `build-binaries.sh`, `browser-smoke-entry.ts`,
`check-browser-smoke.mjs`, `check-lockfile-commit.mjs`, `check-pinned-deps.mjs`,
`check-ts-relative-imports.mjs`, `cost.ts`, `edit-tool-stats.mjs`,
`generate-coding-agent-shrinkwrap.mjs`, `local-release.mjs`,
`profile-coding-agent-node.mjs`, `publish.mjs`, `read-tool-stats.mjs`,
`release-notes.mjs`, `release.mjs`, `session-context-stats.mjs`,
`session-transcripts.ts`, `stats.ts`, `sync-versions.js`, `tool-stats.ts`,
`update-source-imports-to-ts.sh`.

## Package summary

| Package | npm name | Version | Description |
| --- | --- | --- | --- |
| `ai` | `@earendil-works/pi-ai` | 0.79.6 | Unified multi-provider LLM API with automatic model discovery, streaming, OAuth, and a `pi-ai` CLI. |
| `agent` | `@earendil-works/pi-agent-core` | 0.79.6 | Agent runtime: tool-calling loop, transport abstraction, state management, harness, compaction, sessions, skills. |
| `tui` | `@earendil-works/pi-tui` | 0.79.6 | Terminal UI library with differential rendering, components, editor, keybindings, and clipboard support. |
| `coding-agent` | `@earendil-works/pi-coding-agent` | 0.79.6 | The `pi` CLI: interactive TUI coding agent, RPC mode, tools, skills, workflows, extensions, MCP, LSP. |

Dependency graph (build order): `tui` -> `ai` -> `agent` -> `coding-agent`.
`coding-agent` depends on all three; `agent` depends on `ai`; `ai` and `tui`
are leaves.

### Dependency counts

| Package | deps | devDeps | optionalDeps |
| --- | ---: | ---: | ---: |
| `ai` | 4 | 3 | 0 |
| `agent` | 4 | 4 | 0 |
| `tui` | 2 | 2 | 0 |
| `coding-agent` | 20 | 6 | 1 |

Key runtime deps:
- `ai`: `@anthropic-ai/sdk` 0.91.1, `openai` 6.26.0, `partial-json` 0.1.7, `typebox` 1.1.38.
- `agent`: `@earendil-works/pi-ai`, `ignore` 7.0.5, `typebox`, `yaml` 2.9.0.
- `tui`: `get-east-asian-width` 1.6.0, `marked` 18.0.5.
- `coding-agent`: `pi-agent-core`, `pi-ai`, `pi-tui`, `chalk` 5.6.2, `diff` 8.0.4, `glob` 13.0.6, `highlight.js` 10.7.3, `hosted-git-info` 9.0.3, `ignore`, `jiti` 2.7.0, `minimatch` 10.2.5, `proper-lockfile` 4.1.2, `pyright` 1.1.410, `semver` 7.8.0, `typescript` 5.9.3, `typescript-language-server` 5.3.0, `typebox`, `undici` 8.5.0, `yaml`. Optional: `@mariozechner/clipboard` 0.3.9.

## Lines of code

TypeScript source + tests (excludes `node_modules`, `dist`). Counts from
`wc -l` over `*.ts`/`*.tsx`/`*.d.ts`.

| Package | src LOC | test LOC | src+test | src TS files | Description |
| --- | ---: | ---: | ---: | ---: | --- |
| `agent` | 8,040 | 5,340 | 13,380 | 25 | agent runtime + harness |
| `ai` | 10,161 | 5,448 | 15,609 | 44 | unified LLM API |
| `coding-agent` | 66,447 | 42,332 | 108,779 | 221 | the `pi` CLI |
| `tui` | 11,917 | 13,261 | 25,178 | 28 | terminal UI library |
| **Total** | **96,565** | **66,381** | **162,946** | **318** |

678 TypeScript files total (incl. tests) outside `node_modules`/`dist`. Root
`scripts/` add ~5,187 lines of JS/MJS/TS tooling. AI scripts include
`generate-models.ts`.

## Module usage analysis

The **Used?** column in the per-module tables below is computed by scanning
every `import`/`require`/dynamic-import statement across `packages/*/src`,
`packages/*/test`, `packages/*/examples`, `scripts/`, and `.pi/`, resolving
relative imports to their target files, and matching bare/package subpath
imports to source files via `package.json` `exports`/`main`/`types`/`bin`.

Results across all 318 src files:

| Status | Count | Meaning |
| --- | ---: | --- |
| `Yes (hub·N)` | N>=15 importers | High fan-in central module |
| `Yes (N)` | 4–14 importers | Regularly imported |
| `Yes (leaf·N)` | 1–3 importers | Leaf/specialized module |
| `public export` | 3 | Declared in `package.json` exports/bin but not imported within the repo (consumed externally) |
| `binary entry` | 1 | Bun-compiled binary entry (`coding-agent/src/bun/cli.ts`) |
| `type decl` | 1 | Ambient `.d.ts` (`highlight-js-lib-index.d.ts`) |
| orphan | 0 | Imported by nothing |

**Net finding: zero dead/orphan source files.** Every module is either
imported by other code or is a legitimate entry point (public export, binary
entry, worker, or type declaration). The three `public export` files
(`agent/src/node.ts`, `ai/src/cli.ts`, `ai/src/oauth.ts`) are the `./node`,
`pi-ai` bin, and `./oauth` subpaths exposed to external consumers.

---

## `packages/agent` — agent runtime

`@earendil-works/pi-agent-core` — 8,040 src LOC, 5,340 test LOC (25 + 19 files).
Description: "General-purpose agent with transport abstraction, state
management, and attachment support." Exports `.` and `./node`. Docs (4):
`agent-harness.md`, `durable-harness.md`, `hooks.md`, `observability.md`.

#### Core runtime

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `index.ts` | 44 | Yes (hub·73) | The package's front door. Re-exports the agent and harness APIs so other packages can `import { ... } from 'pi-agent-core'` without reaching into internal files. |
| `agent.ts` | 557 | Yes (leaf·1) | The core Agent class — holds an agent's identity, config, and the tool/model setup it runs with. The object you create when you want an agent. |
| `agent-loop.ts` | 748 | Yes (4) | The agent's heartbeat: the loop that sends messages to the model, gets back tool calls, runs the tools, feeds results back in, and repeats until the agent is done. This is what makes an agent 'go'. |
| `proxy.ts` | 365 | Yes (leaf·1) | A thin stand-in for an agent used in headless/embedded setups (e.g. driving an agent over RPC) so callers can control it without the full interactive machinery. |
| `types.ts` | 423 | Yes (14) | Shared TypeScript types every other agent file imports — message shapes, agent options, tool definitions. The common vocabulary of the package. |
| `node.ts` | 2 | public export | Tiny Node-specific entry point exposed as the `./node` subpath for consumers who only want the Node runtime pieces. |

#### Harness core

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `harness/agent-harness.ts` | 1064 | Yes (4) | The harness wraps a raw Agent with everything it needs to run for real: session storage, compaction, skill loading, prompt templates, and hooks. The 'managed' shell around an agent. |
| `harness/types.ts` | 833 | Yes (hub·20) | Type definitions for the harness — config, hooks, session handles, resource budgets. Imported widely because everyone needs these shapes. |
| `harness/skills.ts` | 375 | Yes (4) | Loads SKILL.md files and registers the skills an agent can use (deep-interview, ralplan, team, ultragoal). |
| `harness/system-prompt.ts` | 34 | Yes (leaf·2) | Builds the system prompt that tells the model who it is and what it can do. Small but central — every conversation starts here. |
| `harness/messages.ts` | 164 | Yes (5) | Helpers to convert, wrap, and normalize messages between the format the model expects and the format pi uses internally. |
| `harness/prompt-templates.ts` | 267 | Yes (4) | Loads reusable prompt-template files (the `.md` templates users author) and resolves template variables into final prompts. |
| `harness/env/nodejs.ts` | 492 | Yes (9) | The Node.js execution environment — gives the harness filesystem, process, and shell access when running under Node (vs a browser/worker). |

#### Compaction

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `harness/compaction/compaction.ts` | 756 | Yes (4) | When a conversation outgrows the model's context window, this summarizes older messages so the agent can keep going without losing the gist. The 'forget details, keep the summary' mechanism. |
| `harness/compaction/branch-summarization.ts` | 263 | Yes (leaf·2) | Summarizes a whole conversation branch (a diverged line of thought) into a short note when you switch or collapse branches. |
| `harness/compaction/utils.ts` | 144 | Yes (leaf·2) | Small shared helpers for the compaction code (token counting, message selection). |

#### Session storage

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `harness/session/session.ts` | 266 | Yes (8) | The Session abstraction — a named, resumable conversation with its messages and metadata, independent of where it's stored. |
| `harness/session/jsonl-storage.ts` | 293 | Yes (leaf·3) | Stores sessions on disk as JSONL (one JSON object per line) so they're append-friendly and recoverable even if a line is corrupt. |
| `harness/session/jsonl-repo.ts` | 177 | Yes (leaf·2) | Repository layer over JSONL storage — lists, reads, writes, and deletes session files in a directory. |
| `harness/session/memory-storage.ts` | 131 | Yes (5) | In-memory session storage for tests and ephemeral agents that shouldn't touch disk. |
| `harness/session/memory-repo.ts` | 50 | Yes (leaf·2) | In-memory counterpart to `memory-storage` — the same repo API backed by a Map. |
| `harness/session/repo-utils.ts` | 51 | Yes (4) | Shared helpers for session repositories (path building, listing). |
| `harness/session/uuid.ts` | 54 | Yes (5) | Generates unique IDs for sessions and messages. |

#### Utils

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `harness/utils/truncate.ts` | 344 | Yes (leaf·3) | Trims long strings to a size limit with an ellipsis, keeping tool output and messages from overflowing the screen or context. |
| `harness/utils/shell-output.ts` | 143 | Yes (leaf·2) | Normalizes shell command output (encoding, trailing newlines) before it's shown or stored. |
## `packages/ai` — unified LLM API

`@earendil-works/pi-ai` — 10,161 src LOC, 5,448 test LOC (44 + 24 files).
Description: "Unified LLM API with automatic model discovery and provider
configuration." Exports subpaths: `./anthropic`, `./openai-codex-responses`,
`./openai-completions`, `./openai-responses`, `./oauth`. Ships `pi-ai` CLI.

#### Public API & entry

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `index.ts` | 41 | Yes (hub·113) | Public entry for the whole LLM package. Re-exports the types, provider registry, and streaming functions everything else imports — the single most-imported file in the repo. |
| `cli.ts` | 147 | public export | The standalone `pi-ai` command-line tool: list models, manage OAuth accounts, and check configured providers. Not used inside the repo — only by external users. |
| `oauth.ts` | 1 | public export | One-line re-export that exposes the `./oauth` subpath to external consumers. |

#### Core types & streaming

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `types.ts` | 437 | Yes (hub·44) | The shared vocabulary of the LLM layer — message, provider, model, and option types. Almost every other ai file and every consumer imports these. |
| `stream.ts` | 74 | Yes (11) | Low-level helpers for reading Server-Sent Events and JSON streams from provider HTTP responses — the plumbing that makes streaming replies work. |
| `env-api-keys.ts` | 41 | Yes (leaf·3) | Looks up API keys from environment variables (e.g. `ANTHROPIC_API_KEY`) so providers can authenticate. |
| `session-resources.ts` | 24 | Yes (leaf·2) | Tracks how many resources a session has consumed, for accounting. |

#### Models

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `models.ts` | 95 | Yes (hub·20) | The access layer over the generated model catalog — lets code ask 'what models exist, what can they do, how big is their context?' |
| `models.generated.ts` | 1254 | Yes (leaf·1) | A big generated table of every known model and its capabilities (context size, thinking support, etc.). Generated by a script — never hand-edited. |
| `api-registry.ts` | 98 | Yes (4) | Registry where chat-completion providers register themselves so the rest of the code can look them up by name. |

#### Providers

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `providers/anthropic.ts` | 1102 | Yes (5) | The Anthropic (Claude) provider — turns pi's request format into Anthropic Messages API calls, and handles extended thinking, prompt caching, and OAuth. |
| `providers/openai-responses.ts` | 289 | Yes (leaf·2) | The OpenAI Responses API provider (OpenAI's newer stateful endpoint). |
| `providers/openai-completions.ts` | 1028 | Yes (leaf·3) | The OpenAI Chat Completions provider — OpenAI's classic endpoint, used for most OpenAI models. |
| `providers/openai-codex-responses.ts` | 1495 | Yes (4) | The OpenAI Codex provider (the coding-tuned model with its own OAuth flow). Largest provider file because of Codex-specific streaming and auth. |
| `providers/openai-responses-shared.ts` | 556 | Yes (4) | Shared helpers between the two OpenAI Responses-style providers so they don't duplicate code. |
| `providers/openai-prompt-cache.ts` | 8 | Yes (leaf·3) | Tiny helpers that add prompt-caching hints to OpenAI requests so repeated prefixes are cheaper. |
| `providers/transform-messages.ts` | 220 | Yes (leaf·3) | Converts messages between pi's internal shape and the variations different providers expect. |
| `providers/simple-options.ts` | 22 | Yes (4) | Small helpers for the common option set (temperature, max tokens) shared across providers. |
| `providers/register-builtins.ts` | 230 | Yes (leaf·1) | Called at startup to register all the built-in providers (Anthropic, OpenAI variants) into the registry. |
| `providers/faux.ts` | 499 | Yes (leaf·1) | A fake, deterministic provider used in tests — returns canned responses and never calls a real API, so tests are free and reproducible. |

#### Utils — OAuth

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `utils/oauth/index.ts` | 146 | Yes (hub·115) | The OAuth dispatch hub — the entry point everything calls to start or refresh an OAuth login, which then routes to the right provider's flow. The single most-imported utility in the repo. |
| `utils/oauth/openai-codex.ts` | 607 | Yes (leaf·2) | Implements the full OpenAI Codex OAuth flow (browser redirect, token exchange, refresh). |
| `utils/oauth/anthropic.ts` | 403 | Yes (leaf·2) | Implements the Anthropic OAuth flow. |
| `utils/oauth/oauth-page.ts` | 109 | Yes (leaf·2) | Renders the small local web page the user sees after the OAuth redirect (the success/failure landing page). |
| `utils/oauth/device-code.ts` | 83 | Yes (leaf·3) | Implements the device-code OAuth flow (show a code, user enters it on another device) for providers that support it. |
| `utils/oauth/types.ts` | 79 | Yes (6) | Shared OAuth types — token shapes and flow options. |
| `utils/oauth/pkce.ts` | 34 | Yes (leaf·2) | Implements PKCE — the extra security handshake that makes browser OAuth safe for desktop apps. |

#### Utils — general

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `utils/validation.ts` | 324 | Yes (leaf·2) | Validates user-supplied options against schemas (using typebox) so bad config fails early with a clear message. |
| `utils/json-parse.ts` | 124 | Yes (4) | Parses partial JSON as it streams in — lets pi show a half-finished tool call before the model finishes writing it. |
| `utils/node-http-proxy.ts` | 112 | Yes (leaf·2) | Routes HTTP requests through a configured proxy (respects HTTPS_PROXY env vars). |
| `utils/event-stream.ts` | 88 | Yes (10) | Helpers for parsing SSE 'event:' streams into discrete events. |
| `utils/provider-env.ts` | 52 | Yes (7) | Resolves provider-specific settings from environment variables (base URLs, org IDs, etc.). |
| `utils/diagnostics.ts` | 45 | Yes (leaf·3) | Small helpers that attach diagnostic metadata to requests/responses for debugging. |
| `utils/abort-signals.ts` | 41 | Yes (leaf·1) | Helpers to build and combine AbortSignals so a request can be cancelled cleanly. |
| `utils/overflow.ts` | 79 | Yes (leaf·1) | Handles the case where a request is too big for the model — decides what to trim or error on. |
| `utils/sanitize-unicode.ts` | 25 | Yes (leaf·3) | Cleans up unicode so text renders consistently and doesn't break the terminal. |
| `utils/typebox-helpers.ts` | 24 | Yes (leaf·1) | Small conveniences for building typebox schemas. |
| `utils/headers.ts` | 7 | Yes (4) | Tiny helpers for building and merging HTTP headers. |
| `utils/hash.ts` | 13 | Yes (leaf·1) | A tiny hashing helper used for cache keys. |
### Notes

- `models.generated.ts` (1,254 LOC) is generated from
  `scripts/generate-models.ts`; never edit by hand (per AGENTS.md).
- OAuth implementations exist for OpenAI Codex and Anthropic.
- Tests (5,448 LOC): largest are `openai-codex-stream.test.ts` (1,682),
  `faux-provider.test.ts` (597), `openai-codex-oauth.test.ts` (451),
  `anthropic-sse-parsing.test.ts` (247), plus cache/temperature/thinking/
  tool-name/prompt-cache/device-code tests.

## `packages/coding-agent` — the `pi` CLI

`@earendil-works/pi-coding-agent` — 66,447 src LOC, 42,332 test LOC (221 +
~160 files). The flagship package. Ships the `pi` binary (Node CLI + Bun
compiled binary via `build:binary`). OS: darwin, linux. `piConfig.configDir =
".pi"`. Exports `.` and `./hooks`.

#### Entry & top-level

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `index.ts` | 395 | Yes (hub·109) | The package's public entry — re-exports the SDK API and hooks so external code and the rest of the repo import from one place. Second most-imported file in the repo. |
| `cli.ts` | 20 | Yes (leaf·1) | The 20-line shim that `#!/usr/bin/env node` runs when you type `pi`. Just kicks off `main.ts`. |
| `main.ts` | 688 | Yes (leaf·3) | The CLI's bootstrap: parses the top-level command, loads config, and dispatches to interactive mode, RPC mode, print mode, or a subcommand. |
| `migrations.ts` | 315 | Yes (4) | Upgrades older config/settings files to the current format when pi starts, so users don't have to migrate by hand. |
| `package-manager-cli.ts` | 628 | Yes (leaf·2) | Implements the `pi pkg` subcommand — install, list, and manage pi extension packages. |
| `bun/cli.ts` | 11 | binary entry | The entry point for the Bun-compiled single-file binary. Tiny, because Bun bundles everything else in. |
| `bun/restore-sandbox-env.ts` | 36 | Yes (leaf·2) | Restores environment variables the Bun binary had to scrub for sandboxing, so tools run with the correct env. |

#### Public API

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `api/types.ts` | 1616 | Yes (hub·40) | The public SDK's type surface — the shapes extension authors and the pi SDK expose to the outside world. High fan-in because the whole codebase conforms to it. |

#### CLI commands

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `cli/args.ts` | 221 | Yes (8) | Parses command-line arguments and flags into a structured command object. |
| `cli/workflow-command.ts` | 527 | Yes (6) | Implements the `pi workflow` subcommand — inspect and drive the deep-interview/ralplan/team/ultragoal workflows from the command line. |
| `cli/launch-tmux.ts` | 370 | Yes (leaf·2) | Launches pi inside a tmux session (used for detached/background agent runs). |
| `cli/mcp-command.ts` | 370 | Yes (leaf·2) | Implements the `pi mcp` subcommand — manage MCP server connections. |
| `cli/state-command.ts` | 245 | Yes (leaf·1) | Implements the `pi state` subcommand — read and inspect pi's stored workflow/state files. |
| `cli/startup-ui.ts` | 181 | Yes (4) | The startup flow UI (project trust, config pick, provider login) shown before the main session begins. |
| `cli/list-models.ts` | 111 | Yes (leaf·1) | Implements `pi --list-models` — prints the available models and exits. |
| `cli/file-processor.ts` | 99 | Yes (leaf·3) | Turns `@file` references and file arguments on the command line into message attachments. |
| `cli/config-selector.ts` | 53 | Yes (leaf·1) | Interactive picker that lets you choose which config to use when several are available. |
| `cli/project-trust.ts` | 62 | Yes (leaf·2) | CLI flow that asks the user to trust a project directory before running tools in it (the security gate). |
| `cli/session-picker.ts` | 52 | Yes (leaf·1) | Interactive picker for choosing a previous session to resume. |
| `cli/initial-message.ts` | 43 | Yes (leaf·2) | Handles the very first user message (from `pi "prompt"` or `-p`) so it's queued correctly into the session. |

#### Core — sessions & agents

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `core/agent-session.ts` | 3209 | Yes (hub·26) | The heart of a running pi session — wires the agent loop to the model, tools, session storage, hooks, and compaction, and drives one full conversation. The largest core file. |
| `core/agent-session-runtime.ts` | 433 | Yes (13) | Emits runtime events (turn start/end, tool calls, errors) and runs the hooks around them so the UI and extensions can react. |
| `core/agent-session-services.ts` | 219 | Yes (4) | Assembles the services (model, tools, storage) an agent-session needs and injects them. |
| `core/session-manager.ts` | 1575 | Yes (hub·61) | Owns session lifecycle — create, load, save, list, branch, and resume conversations on disk. High fan-in: almost everything that touches sessions goes through here. |
| `core/subagents.ts` | 642 | Yes (9) | Spawns and tracks child ('sub') agents that run isolated tasks for the main agent and report back. |
| `core/subagent-progress.ts` | 264 | Yes (leaf·3) | Tracks and surfaces progress for running subagents so the UI can show what they're doing. |
| `core/model-registry.ts` | 894 | Yes (hub·31) | The catalog of models pi knows about (from pi-ai plus user config) — discovery, filtering, aliases. High fan-in: model pickers and resolvers all use it. |
| `core/model-resolver.ts` | 572 | Yes (4) | Takes a user's model string/alias and resolves it to a concrete model + provider + key configuration. |

#### Core — config & auth

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `core/config.ts` | 509 | Yes (hub·48) | Loads pi's config files (project `.pi/`, user config) and merges them. High fan-in: nearly every component reads config. |
| `core/settings-manager.ts` | 1265 | Yes (hub·46) | Reads, writes, and validates pi's settings (the persisted user preferences). High fan-in and large because settings touch everything. |
| `core/auth-storage.ts` | 688 | Yes (hub·34) | Stores and refreshes OAuth tokens and API keys securely on disk. High fan-in: anything that calls a provider needs a token from here. |
| `core/resolve-config-value.ts` | 225 | Yes (leaf·3) | Resolves 'dynamic' config values (a literal, an env var, or a shell command) into their final value at runtime. |
| `core/keybindings.ts` | 340 | Yes (hub·17) | Loads and merges keybinding config so the TUI knows what keys do what. |
| `core/agent-profiles.ts` | 161 | Yes (leaf·1) | Loads named agent profiles (model + tools + system-prompt presets) the user can switch between. |
| `core/auth-guidance.ts` | 25 | Yes (4) | Produces human-friendly guidance on how to authenticate when a token is missing or expired. |

#### Core — built-in tools

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `core/tools/index.ts` | 126 | Yes (hub·99) | Barrel that re-exports all built-in tools. High fan-in: the agent-session imports tools through here. |
| `core/tools/bash.ts` | 447 | Yes (8) | The `bash` tool — runs a shell command and returns stdout/stderr. |
| `core/tools/edit.ts` | 437 | Yes (5) | The `edit` tool — makes precise find-and-replace edits to files. |
| `core/tools/edit-diff.ts` | 441 | Yes (leaf·3) | Computes and shows the diff for an edit before/after it's applied. |
| `core/tools/write.ts` | 267 | Yes (leaf·3) | The `write` tool — creates or overwrites a whole file. |
| `core/tools/read.ts` | 362 | Yes (4) | The `read` tool — reads a file (or part of it) into the context. |
| `core/tools/grep.ts` | 385 | Yes (leaf·1) | The `grep` tool — searches file contents with ripgrep. |
| `core/tools/find.ts` | 367 | Yes (leaf·3) | The `find` tool — finds files by name or pattern. |
| `core/tools/ls.ts` | 225 | Yes (leaf·1) | The `ls` tool — lists directory contents. |
| `core/tools/truncate.ts` | 276 | Yes (10) | Trims tool output so it fits within the model's context budget. |
| `core/tools/output-accumulator.ts` | 222 | Yes (leaf·1) | Accumulates streaming tool output into a bounded buffer. |
| `core/tools/path-utils.ts` | 118 | Yes (10) | Shared path helpers for the tools (relative/absolute, normalization). |
| `core/tools/render-utils.ts` | 85 | Yes (9) | Helpers that render tool calls and results for the UI. |
| `core/tools/file-mutation-queue.ts` | 61 | Yes (8) | Serializes file-mutating tools (edit/write) so concurrent edits don't race. |
| `core/tools/tool-definition-wrapper.ts` | 45 | Yes (10) | Wraps a tool definition with pi's standard schema/validation so all tools look uniform. |

#### Core — MCP

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `core/mcp/manager.ts` | 385 | Yes (leaf·2) | Manages the set of connected MCP (Model Context Protocol) servers — lifecycle, capabilities, and tool exposure. |
| `core/mcp/loader.ts` | 335 | Yes (4) | Loads and starts MCP servers from config (stdio or HTTP). |
| `core/mcp/client.ts` | 258 | Yes (4) | The MCP client — speaks the MCP protocol to a server. |
| `core/mcp/tool-bridge.ts` | 299 | Yes (leaf·2) | Bridges MCP server tools into pi's tool registry so the agent can call them like built-in tools. |
| `core/mcp/transports/http.ts` | 755 | Yes (leaf·3) | The HTTP/SSE transport for talking to remote MCP servers. |
| `core/mcp/transports/stdio.ts` | 360 | Yes (leaf·3) | The stdio transport for talking to local MCP servers (spawned as child processes). |
| `mcp/types.ts` | 234 | Yes (9) | Shared MCP type definitions used across the MCP layer. |

#### Core — LSP

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `core/lsp/lsp-tool.ts` | 252 | Yes (leaf·2) | The `lsp` tool — exposes language-server features (diagnostics, definitions, references) to the agent. |
| `core/lsp/client.ts` | 196 | Yes (leaf·1) | Manages a language-server process and talks to it via the LSP protocol. |
| `core/lsp/protocol-utils.ts` | 138 | Yes (leaf·1) | Helpers for encoding/decoding LSP protocol messages. |
| `core/lsp/types.ts` | 79 | Yes (4) | Shared LSP types. |
| `core/lsp/defaults.ts` | 22 | Yes (leaf·2) | Default LSP server config (pyright for Python, tsserver for TypeScript). |

#### Core — extensions

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `core/extensions/runner.ts` | 1161 | Yes (8) | Runs loaded extensions — dispatches hooks (events) to them and collects their contributions (tools, UI, providers). The engine of pi's extensibility. |
| `core/extensions/loader.ts` | 605 | Yes (7) | Discovers and loads extension packages from node_modules and user dirs. |
| `core/extensions/index.ts` | 176 | Yes (hub·110) | Barrel re-exporting the extension API. High fan-in. |
| `core/extensions/wrapper.ts` | 30 | Yes (leaf·1) | Small wrapper that gives an extension a stable handle/context. |
| `extensions/workflow-tools.ts` | 1661 | Yes (leaf·2) | Defines the workflow-specific tools (deep-interview, ralplan, team, ultragoal, subagent) exposed to agents running those workflows. |

#### Core — compaction

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `core/compaction/session-compaction.ts` | 883 | Yes (leaf·2) | Summarizes old parts of a session when it nears the context limit, so long conversations can continue. |
| `core/compaction/branch-summarization.ts` | 371 | Yes (leaf·1) | Summarizes a conversation branch into a short note when it's collapsed. |
| `core/compaction/message-utils.ts` | 170 | Yes (4) | Helpers for slicing and counting messages during compaction. |
| `core/compaction/index.ts` | 7 | Yes (hub·101) | Barrel for the compaction layer. High fan-in. |

#### Core — packages, trust, SDK, misc

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `core/package-manager.ts` | 2588 | Yes (10) | Installs, updates, and removes pi extension packages (resolves npm/git, writes lockfiles). The engine behind `pi pkg`. |
| `core/trust-manager.ts` | 244 | Yes (8) | Decides whether a project/tool is trusted to run and stores trust decisions — the security gate's brain. |
| `core/project-trust.ts` | 96 | Yes (leaf·3) | Checks whether the current project is trusted and prompts if not. |
| `core/resource-loader.ts` | 1037 | Yes (hub·16) | Loads 'resources' — context files, skills, prompt templates — that the agent should see. |
| `core/skills.ts` | 487 | Yes (6) | Loads SKILL.md files and registers the skills an agent can invoke. |
| `core/sdk.ts` | 402 | Yes (11) | The programmatic SDK entrypoint — the function external code calls to embed pi. |
| `core/bash-executor.ts` | 156 | Yes (5) | Actually runs bash commands (spawns the shell, captures output, applies timeouts/permissions). |
| `core/exec.ts` | 107 | Yes (leaf·2) | Small helper to spawn a child process and capture its output. |
| `core/prompt-templates.ts` | 284 | Yes (5) | Loads and renders prompt-template files. |
| `core/system-prompt.ts` | 173 | Yes (5) | Assembles the full system prompt from config, skills, and resources before each run. |
| `core/messages.ts` | 195 | Yes (13) | Helpers to build and transform the message list sent to the model. |
| `core/footer-data-provider.ts` | 366 | Yes (6) | Gathers the data shown in the TUI's footer status bar (model, context usage, git, etc.). |
| `core/openai-codex-usage.ts` | 197 | Yes (leaf·3) | Accounts for OpenAI Codex token/credit usage. |
| `core/output-guard.ts` | 108 | Yes (4) | Guards against output that's too large or unsafe to display. |
| `core/source-info.ts` | 40 | Yes (hub·18) | Tracks which file/source each piece of context came from. High fan-in. |
| `core/http-dispatcher.ts` | 73 | Yes (7) | Central place to make HTTP requests so retries/proxy/headers stay consistent. |
| `core/slash-commands.ts` | 39 | Yes (4) | Registry of in-chat slash commands (like /clear, /model). |
| `core/event-bus.ts` | 33 | Yes (5) | A tiny pub/sub bus for internal events. |
| `core/session-cwd.ts` | 59 | Yes (4) | Tracks and switches the working directory of a session. |
| `core/provider-attribution.ts` | 15 | Yes (leaf·1) | Tags outputs with which provider produced them. |
| `core/provider-display-names.ts` | 5 | Yes (leaf·3) | Maps provider ids to friendly display names. |
| `core/diagnostics.ts` | 15 | Yes (4) | Collects and surfaces diagnostic info. |
| `core/telemetry.ts` | 13 | Yes (leaf·1) | A telemetry stub (no-op by default). |
| `core/timings.ts` | 31 | Yes (leaf·2) | Records timing of operations for profiling. |
| `core/experimental.ts` | 3 | Yes (leaf·3) | Flags for experimental features. |
| `core/defaults.ts` | 3 | Yes (leaf·3) | Default values for config/settings. |

#### Modes — interactive

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `modes/interactive/interactive-mode.ts` | 5934 | Yes (12) | The full interactive TUI — the main screen you see when you run `pi`. Renders messages, handles input, runs tools, and orchestrates the whole experience. The largest file in the repo. |
| `modes/interactive/model-search.ts` | 11 | Yes (leaf·2) | Tiny helper to fuzzy-filter the model list. |
| `modes/interactive/components/session-selector.ts` | 1017 | Yes (5) | The UI for browsing and picking a saved session to resume. |
| `modes/interactive/components/tree-selector.ts` | 1386 | Yes (leaf·3) | A generic tree (nested-list) picker UI — used for selecting from hierarchical options. |
| `modes/interactive/components/model-selector.ts` | 337 | Yes (leaf·2) | The model-picker UI. |
| `modes/interactive/components/config-selector.ts` | 628 | Yes (leaf·1) | The config-picker UI. |
| `modes/interactive/components/settings-selector.ts` | 577 | Yes (leaf·2) | The settings-picker UI. |
| `modes/interactive/components/tool-execution.ts` | 377 | Yes (5) | Renders a tool execution (call + result) in the conversation. |
| `modes/interactive/components/bash-execution.ts` | 220 | Yes (leaf·3) | Renders a bash command run (with its output) in the conversation. |
| `modes/interactive/components/login-dialog.ts` | 222 | Yes (leaf·3) | The login dialog UI (enter an API key or start OAuth). |
| `modes/interactive/components/oauth-selector.ts` | 208 | Yes (leaf·3) | Picker for which OAuth account to use. |
| `modes/interactive/components/account-selector.ts` | 152 | Yes (leaf·2) | Picker for a logged-in account. |
| `modes/interactive/components/assistant-message.ts` | 147 | Yes (leaf·3) | Renders an assistant message in the conversation. |
| `modes/interactive/components/session-selector-search.ts` | 194 | Yes (leaf·2) | Search/filter within the session picker. |
| `modes/interactive/components/status-line/status-line.ts` | 350 | Yes (leaf·1) | Renders the status line — the bar with model/context/git info. |
| `modes/interactive/components/status-line/segments.ts` | 268 | Yes (leaf·3) | Defines the individual segments that make up the status line. |
| `modes/interactive/components/status-line/index.ts` | 21 | Yes (hub·98) | Barrel for the status-line components. High fan-in. |
| `modes/interactive/components/status-line/types.ts` | 86 | Yes (6) | Types for status-line segments and config. |
| `modes/interactive/components/status-line/context-thresholds.ts` | 84 | Yes (leaf·3) | Defines thresholds for when context usage changes color or warns. |
| `modes/interactive/components/status-line/git-utils.ts` | 67 | Yes (leaf·3) | Reads git branch/status for the status line. |
| `modes/interactive/components/status-line/presets.ts` | 36 | Yes (leaf·3) | Built-in status-line layout presets. |
| `modes/interactive/components/status-line/separators.ts` | 19 | Yes (leaf·2) | Renders separators between status-line segments. |
| `modes/interactive/components/skill-hud/render.ts` | 91 | Yes (leaf·3) | Renders the skill HUD (shows active skill state). |
| `modes/interactive/components/skill-invocation-message.ts` | 55 | Yes (leaf·2) | Renders a message showing a skill was invoked. |
| `modes/interactive/components/first-time-setup.ts` | 145 | Yes (leaf·2) | The first-time-setup wizard UI. |
| `modes/interactive/components/extension-selector.ts` | 112 | Yes (leaf·3) | Picker for enabling/disabling extensions. |
| `modes/interactive/components/extension-editor.ts` | 155 | Yes (leaf·2) | Editor UI for an extension's settings. |
| `modes/interactive/components/extension-input.ts` | 87 | Yes (leaf·3) | Renders an input control provided by an extension. |
| `modes/interactive/components/trust-selector.ts` | 134 | Yes (leaf·2) | The trust-prompt UI (trust this project?). |
| `modes/interactive/components/user-message-selector.ts` | 155 | Yes (leaf·2) | Picker for selecting a past user message (e.g. to branch from it). |
| `modes/interactive/components/user-message.ts` | 42 | Yes (leaf·3) | Renders a user message in the conversation. |
| `modes/interactive/components/theme-selector.ts` | 67 | Yes (leaf·1) | The theme picker UI. |
| `modes/interactive/components/thinking-selector.ts` | 74 | Yes (leaf·1) | Picker for the model's 'thinking' level. |
| `modes/interactive/components/show-images-selector.ts` | 50 | Yes (leaf·1) | Toggle for whether to display images inline. |
| `modes/interactive/components/custom-editor.ts` | 80 | Yes (leaf·2) | Hosts a custom editor widget provided by an extension. |
| `modes/interactive/components/custom-message.ts` | 99 | Yes (leaf·2) | Hosts a custom message widget provided by an extension. |
| `modes/interactive/components/bordered-loader.ts` | 68 | Yes (leaf·2) | A loader spinner with a border. |
| `modes/interactive/components/countdown-timer.ts` | 39 | Yes (leaf·3) | A countdown-timer widget. |
| `modes/interactive/components/dynamic-border.ts` | 25 | Yes (hub·21) | Renders dynamic borders (animated/colored). High fan-in. |
| `modes/interactive/components/branch-summary-message.ts` | 58 | Yes (leaf·2) | Renders a branch-summary message in the conversation. |
| `modes/interactive/components/compaction-summary-message.ts` | 59 | Yes (leaf·2) | Renders a compaction-summary message in the conversation. |
| `modes/interactive/components/index.ts` | 36 | Yes (hub·96) | Barrel for the interactive components. High fan-in. |

#### Modes — rpc & print

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `modes/rpc/rpc-mode.ts` | 771 | Yes (leaf·2) | Runs pi as a JSON-RPC server so other programs (editors, scripts) can drive it programmatically instead of via the TUI. |
| `modes/rpc/rpc-client.ts` | 575 | Yes (4) | The client side of the RPC protocol (used by tests and embedders to talk to an RPC server). |
| `modes/rpc/rpc-types.ts` | 264 | Yes (leaf·3) | Types for the RPC protocol. |
| `modes/rpc/jsonl.ts` | 58 | Yes (4) | Frames RPC messages as JSONL (newline-delimited JSON) over stdio. |
| `modes/print-mode.ts` | 156 | Yes (leaf·2) | One-shot mode: `pi -p "prompt"` runs a single prompt and prints the result, no TUI. |
| `modes/index.ts` | 15 | Yes (hub·97) | Barrel for the modes. High fan-in. |

#### Workflows — ultragoal

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `workflows/ultragoal/ultragoal-runtime.ts` | 453 | Yes (5) | Runs the ultragoal workflow — breaks an approved plan into goals and drives an autonomous agent through them with progress tracking. |
| `workflows/ultragoal/ultragoal-receipt.ts` | 570 | Yes (leaf·3) | Produces and verifies 'completion receipts' — tamper-evident records that a goal was actually finished. |
| `workflows/ultragoal/ultragoal-quality-gate.ts` | 478 | Yes (leaf·2) | The quality gate each goal must pass (evidence + verification) before it's marked complete. |
| `workflows/ultragoal/ultragoal-artifacts.ts` | 464 | Yes (leaf·1) | Persists goal artifacts (plans, evidence, outputs) to disk. |
| `workflows/ultragoal/ultragoal-guard.ts` | 196 | Yes (leaf·2) | Checks whether a stored completion receipt is still fresh and valid before treating a goal as done. |
| `workflows/ultragoal/ultragoal-hud.ts` | 52 | Yes (leaf·1) | Renders the ultragoal progress HUD in the TUI. |

#### Workflows — ralplan

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `workflows/ralplan/ralplan-runtime.ts` | 478 | Yes (leaf·3) | Runs the ralplan workflow — a planner/architect/critic consensus process that produces an implementation plan for approval. |
| `workflows/ralplan/ralplan-agents.ts` | 184 | Yes (leaf·2) | Defines the planner, architect, and critic role agents. |
| `workflows/ralplan/ralplan-hud.ts` | 38 | Yes (leaf·1) | Renders the ralplan progress HUD. |

#### Workflows — team & deep-interview

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `workflows/team/team-runtime.ts` | 508 | Yes (leaf·3) | Runs the team workflow — coordinates parallel worker agents on independent tasks with a shared board. |
| `workflows/team/team-hud.ts` | 34 | Yes (leaf·1) | Renders the team-coordination HUD. |
| `workflows/deep-interview/deep-interview-state.ts` | 376 | Yes (4) | Holds and scores the deep-interview state — the questions, answers, and ambiguity scores gathered during a requirements interview. |
| `workflows/deep-interview/deep-interview-runtime.ts` | 364 | Yes (leaf·2) | Runs the deep-interview workflow — asks Socratic questions to surface assumptions before work starts. |
| `workflows/deep-interview/deep-interview-hud.ts` | 93 | Yes (leaf·2) | Renders the deep-interview HUD. |

#### Workflows — harness tools & shared

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `workflows/harness-tools/fetch.ts` | 169 | Yes (leaf·2) | The `fetch` harness tool — retrieves a URL and returns its content. |
| `workflows/harness-tools/github.ts` | 121 | Yes (leaf·2) | The `github` harness tool — runs `gh` CLI commands for issues, PRs, and repos. |
| `workflows/harness-tools/yield.ts` | 78 | Yes (leaf·3) | The `yield` harness tool — lets a subagent finish and return structured output. |
| `workflows/harness-tools/report-finding.ts` | 50 | Yes (leaf·1) | The `report_finding` harness tool — lets a long-running subagent surface intermediate results. |
| `workflows/shared/active-state.ts` | 449 | Yes (hub·20) | Tracks which workflow is currently active and its phase. High fan-in. |
| `workflows/shared/workflow-manifest.ts` | 368 | Yes (leaf·3) | Reads the manifest that declares the available workflows and their schemas. |
| `workflows/shared/workflow-state.ts` | 255 | Yes (12) | Reads and writes workflow state files under `.pi/workflows/`. |
| `workflows/shared/state-writer.ts` | 270 | Yes (10) | Lower-level writer that persists workflow state safely. |
| `workflows/shared/state-schema.ts` | 62 | Yes (4) | Defines the schema for workflow state. |
| `workflows/shared/paths.ts` | 96 | Yes (hub·20) | Resolves the `.pi/workflows/<skill>/` paths. High fan-in. |
| `workflows/shared/canonical-json.ts` | 24 | Yes (leaf·2) | Produces deterministic JSON (sorted keys) so state hashes and receipts are stable. |
| `workflows/shared/receipts.ts` | 8 | Yes (leaf·1) | Tiny helpers for building receipts. |
| `workflows/shared/workflow-id.ts` | 11 | Yes (leaf·1) | Generates workflow run ids. |

#### Harness-runtime

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `harness-runtime/primitives.ts` | 944 | Yes (6) | The core primitives of the test/integration harness runtime — the building blocks (sessions, receipts, leases) the rest is assembled from. Largest file in the dir. |
| `harness-runtime/gc.ts` | 362 | Yes (leaf·2) | Garbage-collects harness resources that are no longer referenced. |
| `harness-runtime/owner.ts` | 341 | Yes (leaf·2) | Tracks ownership of harness resources (who created what) so cleanup is correct. |
| `harness-runtime/rpc.ts` | 252 | Yes (6) | The harness's own RPC channel for driving harness sessions remotely. |
| `harness-runtime/storage.ts` | 198 | Yes (11) | Persists harness runtime state to disk. |
| `harness-runtime/runner.ts` | 191 | Yes (leaf·3) | Runs a harness session (drives the agent under test). |
| `harness-runtime/lease.ts` | 203 | Yes (leaf·3) | Implements leases — time-limited claims on a resource so concurrent runs don't collide. |
| `harness-runtime/types.ts` | 145 | Yes (hub·15) | Types for the harness runtime. High fan-in. |
| `harness-runtime/mutation.ts` | 110 | Yes (leaf·3) | Applies and records mutations (state changes) in the harness. |
| `harness-runtime/vanish.ts` | 146 | Yes (leaf·2) | Cleans up ('vanishes') harness state when a run is abandoned. |
| `harness-runtime/preservation.ts` | 103 | Yes (leaf·3) | Marks which harness state must be preserved across compaction and restarts. |
| `harness-runtime/seams.ts` | 116 | Yes (leaf·2) | Defines the 'seams' (injection points) where the harness can stub or observe behavior. |
| `harness-runtime/endpoint.ts` | 87 | Yes (leaf·2) | The harness endpoint an external client connects to. |
| `harness-runtime/receipt-rules.ts` | 89 | Yes (leaf·2) | Rules that govern when a harness receipt is valid. |
| `harness-runtime/state.ts` | 102 | Yes (6) | The in-memory harness state object. |

#### Utils — fs

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `utils/fs/git.ts` | 226 | Yes (leaf·3) | Helpers to run git commands and parse their output (status, diff, branch). |
| `utils/fs/child-process.ts` | 133 | Yes (7) | Helpers to spawn child processes and capture stdout/stderr safely. |
| `utils/fs/paths.ts` | 118 | Yes (hub·23) | Path helpers (relative/absolute resolution, project root). High fan-in. |
| `utils/fs/fs-watch.ts` | 30 | Yes (leaf·2) | Watches files and dirs for changes. |
| `utils/fs/frontmatter.ts` | 39 | Yes (5) | Parses YAML frontmatter from markdown files. |
| `utils/fs/json.ts` | 6 | Yes (leaf·3) | Tiny JSON read/write helpers. |


#### Utils — system

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `utils/system/tool-installer.ts` | 325 | Yes (leaf·3) | Installs external tools pi needs on demand (pyright, typescript-language-server). |
| `utils/system/changelog.ts` | 196 | Yes (leaf·2) | Parses CHANGELOG.md files (used by the release tooling and the `/cl` audit). |
| `utils/system/shell.ts` | 146 | Yes (8) | Detects the user's shell (bash/zsh/fish) and related env. |
| `utils/system/version-check.ts` | 80 | Yes (leaf·3) | Checks npm for a newer pi version and notifies the user. |
| `utils/system/html.ts` | 51 | Yes (leaf·1) | Small HTML helpers. |
| `utils/system/pi-user-agent.ts` | 4 | Yes (leaf·3) | Builds pi's HTTP User-Agent string. |
| `utils/system/sleep.ts` | 18 | Yes (leaf·1) | A simple sleep/wait helper. |

#### Utils — terminal & clipboard

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `utils/terminal/syntax-highlight.ts` | 146 | Yes (leaf·2) | Syntax-highlights code using highlight.js for display. |
| `utils/terminal/ansi.ts` | 60 | Yes (11) | ANSI escape helpers (colors, cursor). High fan-in. |
| `utils/terminal/open-browser.ts` | 18 | Yes (leaf·1) | Opens a URL in the user's default browser (used for OAuth). |
| `utils/terminal/highlight-js-lib-index.d.ts` | 19 | type decl | Type declarations for the highlight.js lib index (ambient types). |
| `utils/clipboard/clipboard.ts` | 124 | Yes (leaf·3) | Clipboard abstraction that picks the right backend. |
| `utils/clipboard/clipboard-native.ts` | 32 | Yes (leaf·3) | Native clipboard backend (uses the optional clipboard dep). |

#### UI rendering & theme

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `ui/rendering/diff.ts` | 147 | Yes (4) | Renders a unified diff with colors for the TUI. |
| `ui/rendering/keybinding-hints.ts` | 48 | Yes (hub·25) | Renders the keybinding hints shown in the UI. High fan-in. |
| `ui/rendering/visual-truncate.ts` | 50 | Yes (leaf·3) | Truncates text by visible width (accounting for wide/CJK characters). |
| `theme/theme.ts` | 1211 | Yes (hub·74) | Loads, merges, and applies themes (colors/styles) to the TUI. High fan-in and large because theming touches every component. |
### Skills (`src/skills/`, 4 markdown files, 205 lines)

`deep-interview/SKILL.md` (62), `ralplan/SKILL.md` (61), `team/SKILL.md` (39),
`ultragoal/SKILL.md` (43). Each is backed by a runtime in `src/workflows/`.

### Docs (`packages/coding-agent/docs/`, 30 .md + images)

`quickstart.md`, `usage.md`, `development.md`, `extensions.md`, `skills.md`,
`sdk.md`, `rpc.md`, `json.md`, `mcp.md`, `models.md`, `providers.md`,
`custom-provider.md`, `prompt-templates.md`, `themes.md`, `tui.md`,
`keybindings.md`, `settings.md`, `sessions.md`, `session-format.md`,
`compaction.md`, `subagents.md`, `security.md`, `containerization.md`,
`packages.md`, `shell-aliases.md`, `terminal-setup.md`, `tmux.md`,
`termux.md`, `workflow.md`, `index.md`, `docs.json`. Plus images
(`doom-extension.png`, `exy.png`, `interactive-mode.png`, `tree-view.png`).

### Examples (`packages/coding-agent/examples/`, 133 files)

- `examples/sdk/` — 13 SDK examples + README (755 LOC): `01-minimal.ts` …
  `13-session-runtime.ts` (custom-model, custom-prompt, skills, tools,
  extensions, context-files, prompt-templates, api-keys/oauth, settings,
  sessions, full-control, session-runtime).
- `examples/extensions/` — 68 top-level `.ts` example extensions + 9
  subdirectories: `custom-provider-anthropic` (600), `custom-provider-gitlab-duo`
  (472), `doom-overlay` (555), `dynamic-resources` (15), `gondolin` (531),
  `plan-mode` (508), `sandbox` (321), `subagent` (1,141), `with-deps` (32).
  Examples cover custom tools, UI overlays/widgets, provider plugins, games
  (snake, space-invaders, tic-tac-toe, doom overlay), permission gates, git
  integrations, status lines, message renderers, autocomplete, MCP observer,
  plan mode, interactive shell, model status, etc.
- `examples/rpc-extension-ui.ts` — RPC extension UI demo.

### Theme (`src/theme/`)

`theme.ts` + `dark.json`, `light.json`, `theme-schema.json`.

### Tests (42,332 LOC)

~160 test files. Top-level dir holds ~120 unit tests (33,788 LOC). Largest:
`package-manager.test.ts` (2,452), `model-registry.test.ts` (1,619),
`interactive-mode-status.test.ts` (1,051), `tools.test.ts` (1,077),
`harness-runtime-gc.test.ts` (916), `extensions-runner.test.ts` (895),
`auth-storage.test.ts` (738), `tree-selector.test.ts` (679),
`harness-runtime-recovery.test.ts` (798), `resource-loader.test.ts` (791),
`compaction.test.ts` (550), `ultragoal-guard-quality-gate.test.ts` (596),
`tool-execution-component.test.ts` (511), `git-update.test.ts` (484),
`extensions-discovery.test.ts` (488), `model-resolver.test.ts` (498),
`settings-manager.test.ts` (398).

Subdirs:
- `test/suite/` — 33 files, 5,502 LOC — integration harness suite
  (`harness.ts` + faux provider; agent-session runtime/queue/retry/compaction/
  prompt/model-extension/bash-persistence tests + `regressions/`).
- `test/session-manager/` — 7 files, 1,625 LOC.
- `test/mcp/` — 1 file, 1,417 LOC.
- `test/fixtures/` — test fixtures.

## `packages/tui` — terminal UI library

`@earendil-works/pi-tui` — 11,917 src LOC, 13,261 test LOC (28 + 32 files).
Description: "Terminal User Interface library with differential rendering for
efficient text-based applications." OS: darwin, linux. Ships native prebuilds
for macOS modifiers.

#### Public API & core

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `index.ts` | 109 | Yes (hub·98) | Public entry for the TUI library — re-exports the core loop, components, and helpers. High fan-in. |
| `tui.ts` | 1639 | Yes (hub·28) | The core TUI engine — the render loop with differential rendering (only redraws what changed). The heart of the library. |
| `terminal.ts` | 481 | Yes (8) | Abstracts the terminal (raw mode, cursor, size, writes) so the rest of the library is terminal-agnostic. |
| `terminal-colors.ts` | 62 | Yes (leaf·2) | Helpers for terminal color-support detection and conversion. |
| `stdin-buffer.ts` | 434 | Yes (leaf·3) | Buffers and decodes stdin bytes into usable chunks (handles escape sequences arriving in pieces). |
| `native-modifiers.ts` | 59 | Yes (leaf·1) | Loads the native macOS modifier-key prebuild (to distinguish Cmd vs Ctrl on macOS). |
| `utils.ts` | 1181 | Yes (hub·21) | Shared helpers — string width, CJK handling, padding. High fan-in because every component measures text. |

#### Keys & editing primitives

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `keys.ts` | 1388 | Yes (9) | Parses raw input bytes into named key events, including complex escape sequences. |
| `keybindings.ts` | 244 | Yes (7) | Resolves keybinding config into actionable handlers. |
| `kill-ring.ts` | 46 | Yes (leaf·2) | The kill ring — an Emacs-style clipboard for cut/copy within the editor. |
| `undo-stack.ts` | 28 | Yes (leaf·2) | A simple undo/redo stack. |
| `word-navigation.ts` | 117 | Yes (leaf·3) | Helpers for moving the cursor by word. |
| `autocomplete.ts` | 786 | Yes (6) | The autocomplete dropdown component. |
| `fuzzy.ts` | 137 | Yes (4) | Fuzzy-matching scorer used by autocomplete and filtering. |
| `editor-component.ts` | 74 | Yes (leaf·1) | Thin wrapper that adapts the editor into a renderable component. |

#### Components

| Module | LOC | Used? | Key features |
| --- | ---: | --- | --- |
| `components/editor.ts` | 2307 | Yes (leaf·3) | The multi-line text editor component — typing, cursor, selection, cut/paste, undo. The largest file in the library. |
| `components/markdown.ts` | 826 | Yes (leaf·3) | Renders markdown into terminal-formatted text (uses `marked` to parse). |
| `components/input.ts` | 447 | Yes (leaf·3) | A single-line input component. |
| `components/settings-list.ts` | 250 | Yes (leaf·1) | A list component for showing and editing settings. |
| `components/select-list.ts` | 229 | Yes (leaf·3) | A selectable list component (arrow keys + enter). |
| `components/box.ts` | 137 | Yes (leaf·1) | A bordered box component. |
| `components/image.ts` | 126 | Yes (4) | An image component — renders an image in the layout. |
| `components/text.ts` | 106 | Yes (4) | A plain-text component. |
| `components/loader.ts` | 92 | Yes (leaf·3) | A loading-spinner component. |
| `components/cancellable-loader.ts` | 40 | Yes (leaf·1) | A loader that can be cancelled by the user. |
| `components/truncated-text.ts` | 65 | Yes (leaf·2) | A text component that truncates to the available width. |
| `components/spacer.ts` | 28 | Yes (leaf·2) | A layout spacer component. |

### Native

`native/darwin/src/darwin-modifiers.c` compiled to
`native/darwin/prebuilds/{darwin-arm64,darwin-x64}/darwin-modifiers.node`.

### Tests (13,261 LOC, 32 files)

Largest: `editor.test.ts` (4,051), `markdown.test.ts` (1,379),
`overlay-non-capturing.test.ts` (1,202), `tui-render.test.ts` (767),
`input.test.ts` (647), `autocomplete.test.ts` (541), `keys.test.ts` (551),
`stdin-buffer.test.ts` (458), plus overlay/
color/cjk/regional-indicator/wrap/tab/word-navigation/virtual-terminal tests.

---

## Build, check, test

```bash
npm run build        # tui -> ai -> agent -> coding-agent (tsgo)
npm run check        # biome + pinned-deps + ts-imports + shrinkwrap + tsgo --noEmit + browser-smoke
./test.sh            # non-e2e vitest across packages (avoids endpoint-triggered e2e)
npm run test         # runs test in every workspace (includes e2e if env present)
```

Per-package tests use Vitest. `coding-agent`'s `test/suite/` uses
`test/suite/harness.ts` + a faux provider — no real provider keys/tokens. Issue
regressions go under `packages/coding-agent/test/suite/regressions/` named
`<issue-number>-<short-slug>.test.ts`.

`coding-agent` build steps: `tsgo -p tsconfig.build.json`, chmod the CLI,
`copy-assets` (themes, PNG assets, skills). The Bun binary build (`build:binary`)
compiles `dist/bun/cli.js` + the CLI into a single `dist/pi` binary and copies
binary assets.

## TypeScript config

`tsconfig.base.json`: target ES2022, module Node16, strict,
`erasableSyntaxOnly` (Node strip-only — no enum/namespace/parameter-properties
in `packages/*/src` and `test`), declaration + sourcemaps, `allowImportingTsExtensions`.

`tsconfig.json` (root, `noEmit`): workspace path aliases mapping
`@earendil-works/pi-ai`, `pi-agent-core`, `pi-coding-agent` (incl. `/hooks`),
`pi-tui`, `typebox` to source. Includes `packages/*/src/**`,
`packages/*/test/**`, `packages/coding-agent/examples/**`; excludes `dist/`
and the `gondolin` example.

## Release

Lockstep versioning; all packages share one version (`patch` = fixes +
additions, `minor` = breaking changes, no majors). Flow:
1. `/cl` changelog audit of latest `main` commit.
2. Local smoke test: `npm run release:local -- --out /tmp/pi-local-release
   --force`, then run Node + Bun binary smoke tests from outside the repo.
3. `PI_ALLOW_LOCKFILE_CHANGE=1 npm_config_min_release_age=0 npm run
   release:patch` (or `release:minor`) — bumps versions, syncs versions,
   regenerates artifacts, runs `check`, commits, tags `vX.Y.Z`, adds fresh
   `[Unreleased]` changelog sections, pushes.
4. CI (`build-binaries.yml`, job `publish-npm`) publishes to npm via trusted
   publishing (OIDC, env `npm-publish`). No local `npm publish`/OTP needed.
5. If publish fails: rerun the tag workflow after fixing CI/transient issues
   (publish helper is idempotent, skips already-published versions). Do not
   rerun `release:*` for the same version.

See `AGENTS.md` for the full release checklist and contributor gate.
