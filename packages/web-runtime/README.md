# Pi Web Runtime

`@tsuuanmi/pi-web-runtime` is the host-neutral browser runtime for account-scoped web providers. It owns Chromium sessions, profile isolation, provider automation, and private worker communication. Pi owns accounts, entitlements, approvals, sandboxing, and tool execution.

## Standard design

The production boundary is:

```text
ChatGPT native MCP client
        |
        | one authenticated, connector-visible MCP transport
        v
Per-turn Pi MCP gateway
        |
        | private typed worker IPC
        v
Profile worker
        |
        v
Visible Chromium context -> provider page

Pi tool policy and executor are attached to the per-turn gateway.
```

The browser page is a UI automation surface. It must not parse prompt text to invent tool calls. ChatGPT-native tool calls must use ChatGPT's supported connector and MCP protocol.

### Responsibilities

- **Pi host**: account lifecycle, ephemeral entitlements, model registration, approvals, sandboxing, and tool execution.
- **Web provider descriptor**: provider-specific login, route selection, page automation, completion detection, and provider errors.
- **Profile worker**: one persistent visible Chromium context for one browser profile, with isolated turn pages.
- **Turn MCP gateway**: one tool allowlist and capability for one turn; validates calls and routes them to Pi.
- **Worker IPC**: private typed messages between Pi and the profile worker. It is not a connector endpoint for ChatGPT.

## Turn lifecycle

1. Pi selects an active browser account and an entitled web model.
2. Pi creates one turn capability and one tool allowlist.
3. The profile worker leases a Temporary Chat page.
4. ChatGPT's native connector is selected and verified when tools are enabled.
5. The provider submits the prompt through the browser UI.
6. ChatGPT invokes tools through the native MCP connector.
7. The turn gateway validates the turn, tool name, schema, size, and capability before Pi executes the tool once.
8. The MCP result returns to ChatGPT, which continues the same response.
9. The provider waits for a response-scoped terminal state and streams the final output.
10. The page, MCP session, capability, and worker turn handler are closed or revoked on every exit path.

## Transport rule

ChatGPT Web is a remote MCP client. A process-local `McpServerSession` connected over worker IPC is not visible to ChatGPT. A complete native-tool implementation therefore requires one explicit connector-visible MCP transport:

- **Streamable HTTP** is the standard transport for a remote MCP server.
- **stdio** is the standard transport for a locally launched MCP server.

Only one approved transport may be used for a deployment. There is no retry, fallback, compatibility transport, shared daemon, or generic HTTP bridge.

If no connector-visible transport is approved, the web provider is text-only. It must not advertise tool capability or silently execute Pi tools behind a text response.

## Security invariants

- Browser credentials contain only an opaque profile ID and tunnel secret.
- Entitlements are in-memory and account-scoped; they are not persisted in `auth.json`.
- A capability is bound to one profile and one turn, expires, and is revoked during cleanup.
- The browser page receives no Pi process handle, profile object, browser context, or unrelated turn.
- Tool names and schemas are allowlisted per turn.
- Unknown tools, malformed arguments, expired capabilities, connector failures, browser crashes, and selector drift fail closed.
- Tool calls execute exactly once; the browser provider and Pi must not both execute the same call.
- No prompt/XML tool-call parsing is used.
- No provider, model, or transport fallback is used.

## Package boundaries

```text
src/chromium.ts       Chromium provisioning and launch
src/profiles.ts       Profile paths and exclusive leases
src/session.ts        One persistent context and turn pages
src/worker/           Profile worker lifecycle and typed IPC
src/mcp/              Official MCP client/server sessions and codecs
src/providers/        Host-neutral provider descriptors
src/providers/chatgpt/ChatGPT page automation
```

Pi-specific integration belongs outside this package:

```text
packages/pi/src/web-providers/  accounts, entitlements, model registration,
                                Pi tool execution, and turn orchestration
```

Provider modules receive a `Page` and a bound MCP bridge only. They do not receive `BrowserContext`, profile leases, account storage, or other turns.

## Current implementation status

Implemented in this package:

- one visible persistent Chromium context per profile;
- up to five isolated Temporary Chat pages;
- exclusive profile leases and worker handshakes;
- fail-closed worker crash and path/secret checks;
- official MCP SDK sessions over private worker IPC;
- attachment validation and bounded ChatGPT page automation;
- cancellation checks and settled text output handling.

Not implemented yet:

- a connector-visible MCP ingress that ChatGPT Web can call;
- ChatGPT-native connector selection and tool-call/result handling;
- end-to-end browser tool-call fixtures and authenticated smoke coverage.

The internal MCP session is therefore not evidence that ChatGPT-native tools are available. Until the connector ingress exists, ChatGPT web models must remain text-only from Pi's public model capability perspective.

## Explicit exclusions

This runtime does not include the former `codex-chatgpt-web` HTTP bridge, socket broker, tunnel daemon, Electron launcher, Codex passthrough, prompt history/XML contract, retry path, fallback provider, fallback model, or compatibility export.

Any future connector integration must preserve the boundaries and invariants above rather than reintroducing those paths.
