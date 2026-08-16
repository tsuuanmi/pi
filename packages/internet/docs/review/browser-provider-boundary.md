# Browser and Provider Boundary Review

Status: **implemented boundary extraction with a documented follow-up seam for additional providers**.

This review examines `packages/internet/vendor/runtime/src/` and defines the next boundary: a
provider-agnostic browser runtime that can be reused by ChatGPT Web and later browser-backed
providers.

## Executive finding

The current `core/` boundary is sound, and the provider now lives under
`providers/chatgpt-web/`. Its remaining `browser/` directory is provider-specific by design. The
shared session, turn, and response-capture mechanics have been extracted into `src/browser/`.

The intended change is decomposition, not renaming:

- extract the reusable Playwright/session/turn/capture mechanics from the current ChatGPT worker;
- place those mechanics in a provider-agnostic `browser/` runtime;
- keep ChatGPT selectors, login policy, prompt submission, response parsing, model behavior, and
  conversation state in the ChatGPT provider;
- let each provider supply its own browser flow to the shared runtime.

The target should have three inward dependency layers:

```text
cli.ts                         composition root
  ├── providers/chatgpt-web/   provider contract and product behavior
  ├── browser/                 reusable Playwright/session/turn runtime
  └── core/                    process, service, HTTP, and bounded-I/O primitives
```

Dependency direction:

```text
providers/chatgpt-web/ ──┐
                         ├──> browser/ ───> core/
cli.ts ──────────────────┘          └──────> core/
```

`core/` must not import `browser/` or a provider. `browser/` must not import
`providers/chatgpt-web/` or any provider protocol, model, URL, selector, prompt, or state schema.
The composition root supplies a provider browser flow to the browser runtime; no registry is needed
while ChatGPT Web is the only implementation. The current ChatGPT browser directory was the
extraction source, not the shared-browser boundary.

## Review of the current tree

### Already neutral: `src/core/`

These modules are reusable runtime infrastructure and should remain below the browser boundary:

- `config.ts`: runtime home, atomic writes, durable command validation, and shared version metadata;
- `event-queue.ts`: bounded asynchronous event delivery;
- `http-body.ts`: bounded and encoded request-body decoding;
- `process.ts`: process probing and command execution;
- `server.ts`: provider-neutral Bun HTTP hosting;
- `service.ts`: daemon process and drain lifecycle.

The current core import rule is correct and should become a permanent boundary test.

### Extracted reusable browser runtime

`src/browser/` now owns the provider-neutral mechanics:

- `session.ts`: browser/context/page ownership, storage-state access, page capacity, and cleanup;
- `turn.ts`: bounded turns, exclusive maintenance, cancellation, and stage timeouts;
- `response-capture.ts`: response listener lifecycle, provider-selected matching/parsing, waiting, and
  disposal.

The ChatGPT provider supplies the readiness policy, page keys, concurrency value, response matcher,
and response parser. It does not copy the browser lifecycle implementation.

### Provider-specific despite the `browser/` name

The current ChatGPT browser modules directly reference product behavior:

- `browser/login.ts` uses ChatGPT login flow and storage-state rules;
- `browser/login-state.ts` identifies ChatGPT account state;
- `browser/session.ts` owns `chatgpt.com` URLs, composer selectors, account capabilities, and the
  ChatGPT browser concurrency limit;
- `browser/worker.ts` coordinates ChatGPT prompts, model modes, token budgets, conversation canary,
  ChatGPT markdown/image handling, wire capture, and adapter errors.

These files are browser-facing, but they are not generic browser infrastructure. Moving them as-is
under a new `src/browser/` directory would only rename the coupling.

### Provider-specific outside `browser/`

The following areas should remain in the ChatGPT provider boundary:

- `adapter.ts`, `adapter-error.ts`;
- `content/`: ChatGPT prompt compilation, token reserves, markdown conversion, image handling, and
  usage accounting;
- `conversation/`: ChatGPT conversation URLs, journal, sync, and canary;
- `lifecycle/`: ChatGPT configuration, connector identity, setup, diagnostics, and control;
- `models/`: ChatGPT model routes and catalog projection;
- `protocol/`: OpenAI Responses/Codex schemas, parser, bridge, continuation state, compaction,
  reasoning envelopes, and response errors;
- `server/routes.ts`: ChatGPT Responses, health, control, and idle-shutdown routes;
- `tools/`: ChatGPT MCP bridge and synthetic web-search tool;
- `turn/`: ChatGPT request identity, broker payloads, browser-turn execution, and Codex tool rounds;
- `transport/native-passthrough.ts`: ChatGPT/Codex native backend forwarding;
- `transport/wire-response.ts`: ChatGPT conversation payload recognition and projection;
- `transport/tunnel*.ts`: currently coupled to ChatGPT runtime configuration and tunnel lifecycle.

`transport/wire-capture.ts` is the likely first extraction candidate. Its page event subscription,
request correlation, timeout, and cleanup mechanics can become generic if the provider-specific
response matcher remains injected. The current wire-response parser must stay with ChatGPT.

## Proposed target layout

```text
vendor/runtime/src/
├── cli.ts                         # composition root
├── core/                          # provider- and browser-neutral host primitives
│   ├── config.ts
│   ├── event-queue.ts
│   ├── http-body.ts
│   ├── process.ts
│   ├── server.ts
│   └── service.ts
├── browser/                       # provider-agnostic browser runtime
│   ├── session.ts                  # browser/context/page ownership and cleanup
│   ├── turn.ts                     # bounded turns, maintenance, stages, and cancellation
│   └── response-capture.ts         # provider-selected response capture lifecycle
└── providers/
    └── chatgpt-web/                # one complete provider implementation
        ├── adapter.ts
        ├── browser/
        │   ├── login-state.ts
        │   ├── login.ts
        │   ├── selectors.ts
        │   └── session.ts
        ├── conversation/
        ├── content/
        ├── lifecycle/
        ├── models/
        ├── protocol/
        ├── server/
        ├── tools/
        ├── transport/
        │   ├── native-passthrough.ts
        │   ├── tunnel.ts
        │   ├── tunnel-service.ts
        │   └── wire-response.ts
        └── turn/
```

These browser modules are implemented and used by the ChatGPT provider. Do not create empty
feature directories or move a file merely because its current name contains `browser`. Introduce a
formal provider definition only when a second provider makes the shared contract concrete.

## Browser boundary contract

The browser layer should own mechanics, not provider meaning. A provider flow is responsible for
what to do in its product; the browser runtime is responsible for how to execute that flow safely.
The resulting call flow should look like this:

```text
cli.ts
  -> ChatGPT provider adapter
    -> browser runtime
      -> provider-supplied session policy
      -> provider-supplied turn driver
      -> provider-supplied response matcher/parser
      -> shared page/context ownership, cancellation, capture, and cleanup
```

A second provider follows the same flow with different policies and parsers; it does not copy the
worker, session manager, or capture lifecycle.

The browser layer owns mechanics, not provider meaning. Its current public surface is deliberately
small: `BrowserSession`, `BrowserTurnRunner`, `runBrowserStage`, and `BrowserResponseCapture`.
A future provider definition can formalize the callback shape once a second provider exists; for
now, the ChatGPT provider supplies these values directly. The intended shape is:

```ts
export interface BrowserProviderDefinition {
  id: string;
  session: BrowserSessionDefinition;
  turn: BrowserTurnDefinition;
  response: BrowserResponseDefinition;
}

export interface BrowserSessionDefinition {
  homeUrl: string;
  selectors: BrowserSelectors;
  storage: StorageStatePolicy;
  maxConcurrentTurns: number;
}

export interface BrowserTurnDefinition {
  prepare(page: Page, request: unknown): Promise<void>;
  submit(page: Page): Promise<void>;
  cancel?(page: Page): Promise<void>;
}

export interface BrowserResponseDefinition {
  matches(response: Response): boolean;
  parse(response: Response): Promise<unknown>;
}
```

This is a design shape, not an instruction to add speculative abstractions immediately. The
interfaces should be introduced only when the first extraction has a real provider implementation
and a focused test. Provider-specific request, response, and state types must remain outside these
interfaces as opaque values or provider-owned generics.

The browser layer should provide:

- browser/context/page ownership and deterministic cleanup;
- bounded concurrency supplied by the provider definition;
- turn scheduling, cancellation, timeout, and shutdown mechanics;
- page and network event subscription with provider-neutral capture records;
- storage-state loading through provider-supplied filtering and verification policies;
- browser lifecycle errors with provider-neutral error categories.

The provider flow should provide:

- the authenticated home URL and selectors;
- login, storage filtering, and account verification policy;
- prompt rendering, attachment preparation, submission, and completion signals;
- response matching and parsing from the shared capture stream;
- provider-specific model, protocol, conversation, and tool semantics.

The browser layer must not provide:

- ChatGPT URLs, selectors, model IDs, connector names, or account capabilities;
- OpenAI Responses or Codex event names and schemas;
- prompt compilation, token reserves, markdown conversion, or web-search semantics;
- conversation URL parsing, journal formats, or provider-native tool payloads;
- provider login UI assumptions beyond strategy hooks.

## Decomposition map

The extraction splits the current ChatGPT worker by responsibility rather than moving the file
intact:

| Current worker responsibility | New owner | Why |
| --- | --- | --- |
| page/context ownership, close, abort, timeout, and page capacity | `browser/session.ts` | reusable browser lifecycle |
| bounded turns, exclusive maintenance, cancellation, and stage timeout handling | `browser/turn.ts` | reusable turn lifecycle |
| Playwright page/network listener registration and cleanup | `browser/response-capture.ts` | reusable capture lifecycle |
| ChatGPT selectors, URL, effort controls, DOM health, completion evidence | `providers/chatgpt-web/browser/*` | ChatGPT UI contract |
| prompt compilation, image limits, token budgets, markdown conversion | `providers/chatgpt-web/content/*` | ChatGPT input contract |
| ChatGPT wire response recognition and event projection | `providers/chatgpt-web/transport/*` and `protocol/*` | ChatGPT response contract |
| conversation URL/journal/checkpoint handling | `providers/chatgpt-web/conversation/*` | ChatGPT state contract |
| browser-turn request identity and Codex tool rounds | `providers/chatgpt-web/turn/*` initially | current payloads are provider-specific |

The shared worker must receive these provider behaviors as callbacks/strategies. It must not import
ChatGPT modules to invoke them.

## Placement decisions

| Current area | Target owner | Reason |
| --- | --- | --- |
| `core/*` | `core/*` | Already neutral host/runtime primitives |
| worker lifecycle and cleanup | `browser/*` | Reusable browser mechanics |
| generic network event capture | `browser/response-capture.ts` | Reusable when matcher/parser are injected |
| ChatGPT wire payload parsing | `providers/chatgpt-web/transport/wire-response.ts` | Provider response schema |
| ChatGPT selectors and account state | `providers/chatgpt-web/browser/*` | Product-specific browser contract |
| ChatGPT login and storage filtering | `providers/chatgpt-web/browser/*` | Provider authentication policy |
| ChatGPT prompt/content/token logic | `providers/chatgpt-web/content/*` | Provider model and UI constraints |
| ChatGPT conversation continuity | `providers/chatgpt-web/conversation/*` | Provider URL/state schema |
| Responses/Codex protocol | `providers/chatgpt-web/protocol/*` | Not a browser-neutral protocol |
| turn broker and tool rounds | `providers/chatgpt-web/turn/*` initially | Current payloads are ChatGPT/Codex-specific |
| tunnel lifecycle | `providers/chatgpt-web/transport/*` initially | Current config and service names are provider-specific |
| concurrency limit | provider definition | Different providers/accounts may have different limits |

## Migration sequence

1. **Freeze the contract.** Implemented boundary tests reject provider imports from `browser/`
   and reject browser/provider imports from `core/`.
2. **Extract browser session mechanics.** Implemented in `browser/session.ts`, including page/context
   ownership, cleanup, storage-state access, and bounded page capacity.
3. **Extract browser turn mechanics.** Implemented in `browser/turn.ts`, including bounded turns,
   exclusive maintenance, cancellation, and stage timeouts.
4. **Extract response capture.** Implemented in `browser/response-capture.ts`; ChatGPT retains only
   its response matcher and parser.
5. **Move provider ownership.** The ChatGPT implementation now lives under
   `providers/chatgpt-web/`; its selectors, login, state, models, content, protocol, tools, and
   conversation behavior remain provider-owned.
6. **Remove transitional paths.** No old provider-adapter alias, re-export wrapper, compatibility
   folder, or second worker implementation remains.
7. **Verify behavior.** Run runtime typecheck/build, package build, root typecheck, focused browser and
   daemon tests, full Internet tests, boundary/reachability checks, and launcher smoke tests.

Each step should be behavior-preserving. A provider-specific behavior should move once to its final
owner rather than pass through a temporary adapter facade.

## Boundary tests and acceptance criteria

Static and runtime checks should assert:

- `core/` imports neither `browser/` nor `providers/`;
- `browser/` imports neither `providers/chatgpt-web/` nor ChatGPT/OpenAI/Codex identifiers;
- `providers/chatgpt-web/` may import `browser/` and `core/`, but not the reverse;
- only `cli.ts` composes the browser runtime and ChatGPT provider;
- every source module is reachable from `cli.ts` or an explicit provider entrypoint;
- generated runtime output contains one browser implementation and one ChatGPT implementation;
- authenticated wire capture remains authoritative and has no DOM-answer fallback;
- no old provider-adapter path, alias, or compatibility wrapper remains after migration.

## Recommendation

Keep `src/browser/` plus `src/providers/chatgpt-web/` as the source topology. The shared browser
runtime now owns session, turn, timeout, cleanup, and response-capture mechanics; the ChatGPT
provider owns product policy and parsing. When a second provider is added, introduce only the
smallest provider flow contract required by both implementations rather than a speculative
registry or framework.
