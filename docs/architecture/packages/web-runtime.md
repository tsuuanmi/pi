# `@tsuuanmi/pi-web-runtime`

[Package README](../../../packages/web-runtime/README.md) | [Public barrel](../../../packages/web-runtime/src/index.ts) | [Workspace overview](../package-overview.md) | [Integration map](../component-integration-map.md) | [Overlap audit](../package-overlap-audit.md) | [Boundary enforcement](../package-boundaries.md#current-enforcement-gap)

## Role

`@tsuuanmi/pi-web-runtime` is a Node-side browser automation runtime. It supplies host-neutral provider contracts and the mechanics for visible persistent Chromium profiles, per-profile workers, private MCP-over-worker-IPC sessions, and the bundled ChatGPT Web provider.

"Web Runtime" means that it drives web applications. The package itself runs in Node and uses Playwright; it is not a browser-safe frontend package.

It is a workspace leaf with no dependency on another Pi package.

## Boundary

**Owns**

- `WebProviderDescriptor`, model, turn, attachment, tool, entitlement, event, and MCP bridge contracts.
- Playwright Chromium provisioning and visible persistent context startup.
- Opaque browser-profile validation, exclusive profile leases, and profile removal helpers.
- One reusable worker per profile and bounded isolated pages per turn.
- Typed worker protocol, startup proof, cancellation, crash handling, and turn message routing.
- Host/server and worker/client MCP sessions over callback-based JSON-RPC transport.
- Short-lived, turn-bound capability issue, validation, and revocation.
- Concrete ChatGPT login verification, route discovery, attachment validation/upload, prompt submission, and text streaming.

**Does not own**

- Pi account names, active-account selection, credential persistence, or model registry.
- Application resource discovery and descriptor loading policy.
- Conversion to `@tsuuanmi/pi-ai` models/events or integration with the Agent loop.
- Host tool approval and execution policy.
- Workflow policy, terminal UI, or application sessions.
- A network-visible MCP endpoint. Its current MCP transport is private process-local worker IPC.

## Public entry point

The root [`src/index.ts`](../../../packages/web-runtime/src/index.ts) exports:

- Chromium provisioning/launch helpers and errors.
- Profile leases, profile paths/removal, and profile errors.
- `BrowserSession` and session errors.
- Worker client, worker pool, worker factory/handler types, and worker protocol types.
- MCP server/client sessions, capability store, callback transport, and errors.
- Web provider/model/turn/tool/event/attachment/entitlement contracts.
- ChatGPT Web descriptor and provider identity constants.

The package export map exposes only `.` and `./package.json`. Internal provider and worker modules are not general subpath APIs; descriptor discovery reaches them through package metadata and descriptor-relative paths.

## Components

| Component | Source | Responsibility |
|---|---|---|
| Provider contracts | [`src/types.ts`](../../../packages/web-runtime/src/types.ts) | Host-neutral descriptors, models, turns, events, tools, attachments, and MCP bridge |
| Chromium | [`src/chromium.ts`](../../../packages/web-runtime/src/chromium.ts) | Ensures Playwright Chromium exists and launches a visible persistent context |
| Profiles | [`src/profiles.ts`](../../../packages/web-runtime/src/profiles.ts) | Profile-id validation, secure directory mode, exclusive lock-file lease, and removal |
| Browser session | [`src/session.ts`](../../../packages/web-runtime/src/session.ts) | Owns one browser context and bounded isolated turn pages |
| Worker client/pool | [`src/worker/client.ts`](../../../packages/web-runtime/src/worker/client.ts), [`src/worker/pool.ts`](../../../packages/web-runtime/src/worker/pool.ts) | Worker-thread lifecycle, authenticated startup, reuse by profile, cancellation, and routing |
| Worker entry/session | [`src/worker/entry.ts`](../../../packages/web-runtime/src/worker/entry.ts), [`src/worker/session.ts`](../../../packages/web-runtime/src/worker/session.ts) | Opens the profile, creates turn pages and MCP clients, and runs descriptors inside the worker |
| MCP bridge | [`src/mcp/`](../../../packages/web-runtime/src/mcp) | Official MCP client/server sessions over private callback JSON-RPC transport |
| Capability store | [`src/mcp/capability.ts`](../../../packages/web-runtime/src/mcp/capability.ts) | Expiring turn capability tokens and revocation |
| ChatGPT descriptor | [`src/providers/chatgpt/index.ts`](../../../packages/web-runtime/src/providers/chatgpt/index.ts) | Provider identity, route metadata, worker location, verification, and turn function |
| ChatGPT automation | [`src/providers/chatgpt/`](../../../packages/web-runtime/src/providers/chatgpt) | Login/entitlement checks, selectors, routes, uploads, errors, completion, and streaming |

## Discovery and turn flow

```text
package.json pi.webProviders
  -> Pi resource loader finds descriptor module
  -> Pi WebProviderHost imports and validates default export
  -> descriptor-relative worker path is resolved

Pi web-model stream request
  -> validate active browser account and route entitlement
  -> open host-side McpServerSession and issue turn capability
  -> ProfileWorkerPool reuses/starts worker for profile
  -> worker startup proof and profile lease
  -> BrowserSession creates an isolated page
  -> worker-side McpClientSession binds the turn
  -> descriptor.runTurn(WebTurn, emit)
  -> WebTurnEvent values cross worker IPC
  -> Pi converts them to AI AssistantMessageEvent values
  -> capability revoked and turn resources closed
```

A profile worker is keyed by profile id and refuses reuse with a different profile path, tunnel secret, or worker module. Each turn gets a separate page; the profile's persistent browser context carries authenticated browser state across turns.

## Dependencies

### Workspace

None.

### External runtime

| Dependency | Why it is used |
|---|---|
| `playwright` | Chromium installation, persistent contexts, pages, selectors, upload, and browser automation |
| `@modelcontextprotocol/sdk` | Host/server and worker/client MCP sessions and JSON-RPC message contracts |

The package also uses Node worker threads, crypto, filesystem, path, process, and child-process APIs.

## Interaction with Pi

`@tsuuanmi/pi` is the only workspace consumer.

Pi owns:

- Package/resource discovery and runtime validation of descriptor modules.
- Browser credential records, account names, active account, profile root, and in-memory entitlements.
- Registration of entitled web routes as AI-compatible models.
- Serialization of AI context and conversion of web events to AI stream events.
- Tool allowlisting, approval, execution, and final tool results.
- Shutdown of profile workers when resources or sessions change.

Web Runtime owns the descriptor contract and browser/worker/MCP mechanics. This split prevents browser providers from importing Pi auth, Agent, AI, TUI, or workflow types.

## State, security, and lifecycle

- The host chooses the profile root; Web Runtime validates profile ids and protects one profile with an exclusive `.pi-browser.lock` lease.
- Persistent Chromium profile data carries login state. One profile must not be shared by multiple worker instances.
- Turn capabilities are random, time-limited, bound to one turn, and revoked on completion.
- MCP tools are allowlisted from the turn's tool definitions; host-side execution remains behind the callback supplied by Pi.
- Worker crashes and profile/session errors fail the active turn rather than switching providers or profiles.
- Chromium provisioning may run Playwright's `install chromium` command and can require filesystem, subprocess, and network access.
- Visible Chromium requires a graphical desktop/display and access to the target web application.

## Provider descriptor seam

A package resource can supply a default-exported `WebProviderDescriptor` through `package.json` `pi.webProviders`. The descriptor names a relative worker module that remains adjacent to the compiled descriptor so Pi can resolve it safely. The bundled ChatGPT worker calls the package-internal `startWorker(descriptor)` helper.

The public root exports the descriptor contract and worker protocol/pool types, but it does not export `startWorker`. Descriptor discovery is supported by Pi; a turnkey third-party worker bootstrap is not yet a complete stable public API.

A descriptor implements:

- `verify(profileDir, signal)` to authenticate and return entitled routes.
- `runTurn(turn, emit)` to drive one isolated page and emit normalized events.
- Stable provider/model metadata and a relative worker path.

`ProfileWorkerFactory` is the lower-level test/alternate-worker seam.

## Current limitation

The private MCP bridge is wired between Pi and the worker, but the current ChatGPT page automation does not consume `WebTurn.tools` or invoke `WebTurn.mcp`. It currently emits browser-produced text. Connector-visible browser tool invocation remains a separate, unimplemented integration boundary.

## Runtime constraints

- ESM; Node.js 22.19 or newer.
- A Playwright-supported graphical Chromium environment is required.
- Provider automation depends on external web UI routes and selectors and can fail closed when that UI changes.
- The package is bundled into Pi's published distribution as well as being a workspace package.
