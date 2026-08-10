# Pi Web Runtime

`@tsuuanmi/pi-web-runtime` is Pi's host-neutral browser runtime for account-scoped web providers. It owns Chromium provisioning, profile isolation, worker lifecycle, and provider page automation. Pi owns accounts, entitlements, model registration, policy, and tool execution.

## Package loading

The package declares its compiled provider descriptor in `package.json` under `pi.webProviders`. Pi loads that descriptor and its adjacent worker from the bundled `pi:web-runtime` package source.

The built-in provider ID is `chatgpt-web`. Its routes are:

- `light` — ChatGPT Instant
- `medium` — ChatGPT Medium
- `high` — ChatGPT High
- `extra-high` — ChatGPT Extra High
- `pro` — ChatGPT Pro

Login verification derives the entitled route set from one canonical effort menu shape. Unknown menu shapes fail closed.

## Runtime boundary

```text
Pi account and turn host
        |
        | private typed worker IPC
        v
Profile worker
        |
        | one isolated page per turn
        v
Visible persistent Chromium context -> ChatGPT Temporary Chat
```

- **Pi host**: account lifecycle, ephemeral entitlements, model registration, policy, and tool execution.
- **Web provider descriptor**: login verification, route selection, prompt and attachment submission, response streaming, and provider errors.
- **Profile worker**: one persistent visible Chromium context for one browser profile, with up to five isolated turn pages.
- **Worker IPC**: typed process-local messages. It is not a network endpoint and is not visible to ChatGPT.

The provider receives a `Page` and turn-scoped inputs. It does not receive a `BrowserContext`, profile lease, account storage, or another turn.

## ChatGPT turn contract

Each turn uses one canonical ChatGPT DOM contract and follows these stages:

1. Open a fresh Temporary Chat page and require exactly one visible composer.
2. Select the entitled effort item and require semantic `aria-checked` confirmation.
3. Insert the complete prompt through Playwright in bounded chunks and verify it byte-for-byte.
4. Upload validated attachments and require one visible ready group for every unique file.
5. Submit once and require a new user turn, assistant turn, or active-generation control as acceptance evidence.
6. Scope all response observation to the newly created assistant turn.
7. Stream stable visible reasoning and append-only GFM blocks.
8. Complete only after generation stops, response text is non-empty, the completed-turn action is visible, and text plus HTML remain stable.
9. Close the turn page on success, cancellation, browser failure, selector drift, or provider error.

There is no alternate selector set, retry submission, prompt parser, stale-text recovery, provider fallback, model fallback, transport fallback, legacy path, or compatibility alias. Unexpected DOM and state transitions fail closed with a stage-specific error.

## ChatGPT output boundary

The built-in ChatGPT provider advertises text and visible reasoning. It does not advertise tool output.

`src/mcp/` provides a private turn-capability bridge for descriptors that can directly observe and represent a provider-native tool call. That bridge does not make Pi's MCP server reachable from the remote ChatGPT page. A connector-visible network ingress is intentionally outside this package, so the ChatGPT descriptor does not select a connector, infer tool calls from text, or silently execute Pi tools.

## Source layout

```text
src/chromium.ts                    Chromium provisioning and launch
src/profiles.ts                    Profile paths and exclusive leases
src/session.ts                     Persistent context and isolated turn pages
src/worker/                        Worker lifecycle, protocol, and typed IPC
src/mcp/                           Private turn capability and MCP sessions
src/providers/chatgpt/composer.ts  Active composer and exact prompt insertion
src/providers/chatgpt/effort.ts    Effort discovery and selection
src/providers/chatgpt/attachments.ts Attachment validation and readiness
src/providers/chatgpt/submit.ts    Single submission and acceptance evidence
src/providers/chatgpt/response.ts  Response-scoped DOM snapshot
src/providers/chatgpt/markdown.ts  Append-only GFM serialization
src/providers/chatgpt/trace.ts     Visible reasoning stabilization
src/providers/chatgpt/completion.ts Completion and DOM health state
src/providers/chatgpt/stream.ts    Response event stream
src/providers/chatgpt/turn.ts      Provider turn coordinator
```

Pi-specific integration remains under `packages/pi/src/web-providers/`.

## Security invariants

- Browser credentials contain only an opaque profile ID and worker handshake secret.
- Entitlements are in memory and account scoped.
- A capability is bound to one turn, expires, and is revoked during cleanup.
- Profile directories are private, exclusively leased, and never exposed to provider code.
- Unknown routes, malformed attachments, browser crashes, page closure, ambiguous DOM, and selector drift fail closed.
- Prompt text is never parsed to invent tool calls.
- No HTTP proxy, socket broker, tunnel daemon, shared browser daemon, Electron launcher, Codex passthrough, or configuration mutation is included.

## Attribution

The ChatGPT browser-turn state machine adapts MIT-licensed logic from `codex-chatgpt-web`. See `NOTICE` for the required copyright and license text.
