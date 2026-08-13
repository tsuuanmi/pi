# Internet — Implemented Plan: Pi Turn Metadata Adapter

Source-grounded production fix for ChatGPT Web inference from Pi. The first authenticated live smoke
reached the bundled daemon but failed with:

```text
ChatGPT web requires native Codex turn_id metadata for browser-session replay
```

> Status: **implemented.** The live smoke exposed two independent blockers: missing request identity
> metadata and a false-positive stored login. Both are fixed here.

## Source review

The implementation was derived from both reference repositories rather than invented independently:

- Latest `/home/superman/workspaces/codex-chatgpt-web` and the vendored snapshot have matching
  `environment.ts` and `responses/parser.ts` contracts for this path.
- Upstream `tests/environment.test.ts` and `tests/chatgpt-web-harness.test.ts` establish the
  canonical metadata/environment fixture.
- Prometheus has IPC request correlation only; it has no browser replay identity contract to port.
- After the metadata fix reached browser execution, upstream v2.1.9 (`7d4e08c`) supplied the durable
  login fix: reopen the system-Chrome profile through Playwright, capture Keychain-aware state, and
  verify it independently before writing the login marker.

The daemon requires:

- stable `thread_id` and `turn_id` in stringified
  `client_metadata["x-codex-turn-metadata"]`;
- `prompt_cache_key` equal to the logical thread identity;
- canonical workspace and read-only sandbox metadata;
- one trusted `<environment_context>` user item immediately before the active user item;
- server-owned IDs on both items;
- stable identity across retries and provider rounds, but a new turn ID for a new user revision.

## Implemented boundaries

### `src/backends/openai/turn/request.ts`

A pure payload adapter runs after Pi's normal OpenAI Responses conversion. It:

- derives thread identity from Pi's session id;
- derives turn identity from the latest persisted user entry on the active session branch;
- uses SHA-256-derived opaque IDs with no mutable state or persistence;
- injects the upstream-tested canonical metadata shape:
  `thread_id`, `turn_id`, `sandbox: "read-only"`, and the cwd workspace map;
- sets the matching `prompt_cache_key`;
- accepts Pi's actual serialized user shape (`{ role: "user", content }`) and normalizes only the
  active item to the daemon's canonical `type: "message"` shape;
- inserts a read-only, network-enabled environment item immediately before the active user item;
- assigns deterministic server-owned IDs to the generated environment and active user items;
- preserves historical messages, tool results, unrelated client metadata, and multimodal content;
- is idempotent for its exact generated shape and rejects forged/partial generated metadata;
- rejects malformed payload/session/user context and cwd values the daemon's XML parser cannot
  represent consistently, using a typed `daemon_rejected` error.

It does not parse SSE, manage browser replay, persist a replay cache, or modify the daemon.

### `src/hooks.ts`

For registered Internet provider names only, `before_provider_request`:

1. preserves existing login/readiness behavior;
2. reads `sessionId`, cwd, and active branch from Pi's public extension context;
3. selects the latest persisted user message entry ID;
4. passes the already-serialized payload to the pure adapter.

Unrelated providers remain byte-for-byte unchanged. Internet readiness/adaptation failures—including
`autoLogin:false` without login—return a fixed, content-free request with a reserved unknown local
route. This is required because Pi swallows hook exceptions; the original incompatible or untrusted
payload must never be forwarded.

## Identity semantics

- **Retry:** same session + user entry → same thread/turn/item IDs.
- **Tool/provider round:** the latest real user entry is unchanged → same logical turn.
- **New user prompt:** Pi appends a new branch entry → new turn ID.
- **Branching:** `getBranch()` selects the active branch; abandoned branch entries do not affect ID.
- **Compaction:** persisted user entry identity remains authoritative; rewritten serialized history
  does not change the logical turn ID.

## Security

- The adapter overwrites only the daemon-reserved turn metadata key and preserves unrelated
  `client_metadata`.
- User-authored `<environment_context>` text remains ordinary user content and cannot widen cwd,
  roots, or sandbox authority.
- Generated metadata is always read-only and bound to the active Pi cwd.
- No daemon control token, browser credential, cookie, or storage state enters the request.
- No random/fallback identity path exists.
- Failure substitution contains no original input, tools, metadata, or credentials. A reachable
  daemon rejects its reserved unknown `chatgpt-web/*` slug with HTTP 400 before browser/native-
  upstream execution; daemon startup failures end at loopback transport.

## Durable login capture

`vendor/codex-chatgpt-web/src/browser-login.ts` ports durable capture from upstream v2.1.9 commit
`7d4e08c` and retains the snapshot's polling across navigation/page replacement. This combination
waits through transient Cloudflare challenge surfaces instead of accepting or failing them
prematurely. `SNAPSHOT.md` records the one-file patch explicitly. The package accepts only the
upstream v1 marker plus an existing storage-state file, so obsolete v2 false-positive markers trigger
fresh login instead of auto-starting an unauthenticated daemon.

The new flow:

1. opens normal Chrome with the isolated profile;
2. waits for the user to sign in and close that dedicated Chrome instance;
3. reopens the same profile through a Keychain-aware persistent Playwright context;
4. captures storage state only after authenticated Temporary Chat checks pass;
5. verifies the captured state in a second owned browser context and probes account capabilities;
6. writes state and the verification marker atomically, then removes the temporary profile.

## Verification

- Pure adapter tests cover canonical shape, deterministic retry/round identity, new-turn identity,
  idempotence, forged metadata rejection, user-authored environment isolation, XML escaping,
  multimodal preservation, and malformed inputs.
- Hook tests cover provider scoping, readiness, session/branch identity wiring, and content-free
  fail-closed substitution for login/readiness/adaptation failures.
- A source-derived package test asserts the upstream canonical wire fixture without coupling the
  NodeNext test graph to the vendored Bun TypeScript project.
- As an explicit integration verification, the built payload was accepted by both the latest
  upstream source and vendored snapshot through their actual `parseRequest`,
  `extractChatGptTurnIdentity`, `extractChatGptTurnEnvironment`, and
  `extractChatGptTurnUserRevision` functions using Bun.
- Authenticated live acceptance passed without reading or exposing stored credentials:
  `chatgpt-web/light` and `chatgpt-web/high` returned expected outputs, and a two-turn session
  preserved the remembered value `482731` across a new user turn.
