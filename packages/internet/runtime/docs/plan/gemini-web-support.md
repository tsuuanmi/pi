# Gemini Web Support Implementation Plan

**Status:** Implemented
**Date:** 2026-08-17
**Scope:** Browser-backed `https://gemini.google.com`, not the existing `gemini-api` provider.
**Path convention:** Paths beginning with `src/` are relative to `packages/internet/runtime/` unless stated otherwise.

## 1. Goal

Add a provider-backed Gemini Web runtime while preserving current ChatGPT Web behavior. The first release supports authenticated, browser-only Gemini conversations with text streaming, cancellation, capability reporting, and explicit rejection of unsupported features.

The implementation must port shared mechanics into the existing shared runtime areas:

- `packages/internet/runtime/src/browser/` for browser lifecycle, page leasing, turn scheduling, timeouts, cancellation, cleanup, and response-listener ownership.
- `packages/internet/runtime/src/core/` for normalized protocol types, provider contracts/factory, HTTP handling, config/path utilities, redaction, persistence helpers, and common health reporting.

Provider-specific behavior remains isolated in `browser/gemini-web/` and `providers/gemini-web/`. Do not make Gemini a set of selector branches inside the ChatGPT implementation.

## 2. Scope and non-goals

### In scope

- A distinct Gemini Web runtime/provider identity.
- Isolated Gemini browser storage and login verification.
- New Gemini conversation creation.
- Immutable one-to-one mapping from each Pi session ID to one native Gemini chat ID.
- Text input and streamed text output.
- Browser turn cancellation, timeout containment, and page cleanup.
- Account-specific model/capability discovery.
- Doctor output and actionable authentication/browser errors.
- Offline unit tests with sanitized HTML and transport fixtures.
- A separately gated live smoke test against a manually provisioned account.

### Explicitly out of scope for the first milestone

- Google Generative Language API changes; `gemini-api` remains independent.
- OpenAI tunnels, ChatGPT connectors, or MCP/local tool execution.
- Claims of arbitrary Gemini Web tool support.
- Image/file upload until a tested Gemini upload flow exists.
- Structured output guarantees until the Web UI behavior is proven.
- Exact usage accounting unless the Web surface exposes reliable usage data.
- Broad refactoring unrelated to the shared boundaries listed here.

## 3. Target architecture

```text
runtime/src/core/
  provider.ts                 provider descriptor and factory contracts
  protocol/
    types.ts                  normalized request/event/usage types
    responses/                provider-neutral Responses bridge, if audit confirms it
  server.ts                   provider-neutral HTTP host
  ...                         config, process, persistence, redaction, health helpers

runtime/src/browser/
  session.ts                  shared Playwright browser/context/page pool
  turn.ts                     shared stages, limits, cancellation, maintenance
  response-capture.ts         shared response listener lifecycle
  ...                         extracted browser turn orchestration
  chatgpt-web/                ChatGPT-specific browser behavior
  gemini-web/                 Gemini-specific browser behavior

runtime/src/providers/
  chatgpt-web/                existing ChatGPT adapter and provider behavior
  gemini-web/                 Gemini adapter, translation, parser, lifecycle, models
```

The exact file split is subject to the extraction audit. Shared code must be moved only when it has no ChatGPT URL, selector, model, wire-format, conversation, or tool assumptions.

## 4. Required decisions before coding

Record these decisions in the implementation PR or an update to this plan before Phase 2:

1. **Provider/account ID:** use a distinct `gemini-web` identity rather than conflating browser state with `gemini-api` or the existing OpenAI/ChatGPT account.
2. **Transport:** document whether Gemini output is DOM-only, fetch/SSE, WebSocket, or a combination. Choose the most stable supported path and keep a DOM fallback only if required.
3. **Conversation continuation:** native `/app/<chat-id>` URLs reopen safely. Persist one URL under the Pi session ID and reject missing or changed identity rather than replaying or rebinding.
4. **Model names:** register only model labels/IDs confirmed by the signed-in Web account. Do not copy the Gemini API catalog.
5. **Account state allowlist:** derive the minimum Google/Gemini origins from a real storage export and document why each is allowed.
6. **Feature policy:** first milestone rejects tools, files/images, structured output, and unsupported reasoning modes with typed errors.
7. **Concurrency:** confirm whether one Gemini account can safely sustain multiple tabs. Set the first limit conservatively if the answer is unknown.

## 5. Phase 0: live discovery and evidence capture

**Output:** a sanitized capability/transport report; no production provider code yet.

### Tasks

1. Create a disposable Gemini test profile and account workflow. Do not use a personal storage export in fixtures or commits.
2. Add or use a temporary Playwright probe that records:
   - URL transitions and authenticated surface evidence;
   - accessibility tree and redacted DOM snapshots;
   - composer/model-picker/stop/completion signals;
   - request method, hostname, pathname, content type, and timing;
   - response framing and selected redacted payload shapes;
   - tab behavior during concurrent turns and cancellation.
3. Verify login cases:
   - fresh login;
   - expired state;
   - signed-out page;
   - MFA/passkey/consent interruption;
   - account switching.
4. Verify turn cases:
   - fresh chat;
   - resumed chat;
   - long response;
   - stop during generation;
   - network interruption;
   - quota/safety/model errors.
5. Verify capabilities:
   - available model choices;
   - text streaming;
   - thinking/reasoning visibility, if any;
   - image/file input;
   - citations and usage;
   - tool/connected-app behavior.
6. Redact cookies, authorization headers, prompt text, uploaded content, and account identifiers before retaining evidence.

### Exit criteria

- A stable authenticated-surface check is identified.
- The minimum storage origins are known.
- New-chat and completion signals are identified.
- The response transport and parser strategy are selected.
- Unsupported first-milestone features are listed explicitly.
- No implementation proceeds with guessed selectors or guessed wire formats.

## 6. Phase 1: extract shared runtime logic without changing behavior

**Goal:** make the existing ChatGPT path use `src/browser/` and `src/core/` shared contracts before adding Gemini.

### 6.1 Inventory and dependency audit

- Build an import graph for `src/providers/chatgpt-web/`.
- Classify each module as shared, ChatGPT-specific, or uncertain.
- Identify imports that encode `chatgpt.com`, `openai.com`, ChatGPT model IDs, ChatGPT wire paths, ChatGPT selectors, connector names, or tunnel assumptions.
- Add characterization tests before moving uncertain code.

### 6.2 Move normalized protocol contracts to `src/core/`

Split `src/providers/chatgpt-web/protocol/types.ts`:

- Move provider-neutral definitions to `src/core/protocol/types.ts`:
  - `ParsedRequest` and common context/message/content types;
  - tool and tool-choice shapes;
  - `AdapterEvent`, usage, citations, message phases;
  - generic continuation-state shape.
- Keep ChatGPT-only metadata and comments in the ChatGPT namespace.
- Update all runtime imports to the new core path in one controlled change.
- Do not leave a new compatibility alias unless an internal consumer requires it; update consumers directly.

Audit `src/providers/chatgpt-web/protocol/responses/` and move only provider-neutral Responses bridging, schema validation, event serialization, and error normalization into `src/core/protocol/responses/`. Keep ChatGPT-specific request adaptation and output quirks in `providers/chatgpt-web/`.

### 6.3 Extract browser turn mechanics to `src/browser/`

Keep or refine the existing shared modules:

- `src/browser/session.ts`: browser/context/page lifecycle and storage-state loading.
- `src/browser/turn.ts`: runner capacity, maintenance exclusion, timeout stages, abort propagation.
- `src/browser/response-capture.ts`: response listener lifecycle and parse callback ownership.

Extract from ChatGPT worker/turn execution only:

- turn registration and duplicate-key rejection;
- page lease acquisition/release;
- timeout and abort containment;
- common cleanup/finalization;
- normalized event forwarding.

Do not move ChatGPT selectors, prompt construction, conversation URL logic, or tool approval logic.

Add unit tests for each extracted behavior before switching ChatGPT to the new helpers.

### 6.4 Add provider registry/factory in `src/core/`

Add a narrow provider contract that separates shared orchestration from provider behavior. It should cover only proven common boundaries, such as:

- provider identity and configuration validation;
- adapter creation;
- login/capability hooks where the caller needs a common lifecycle operation;
- provider-specific error normalization.

The factory must reject an unknown adapter and must not infer Gemini from a model name or base URL. `server/routes.ts` should resolve the configured provider through this factory instead of constructing ChatGPT directly.

### 6.5 Preserve ChatGPT behavior

After each extraction:

- run existing browser and daemon tests;
- verify ChatGPT login-state validation remains ChatGPT/OpenAI-only;
- verify ChatGPT wire capture still matches only ChatGPT backend responses;
- verify tunnel/full-mode setup is unchanged;
- review the diff for accidental provider-neutralization of ChatGPT policy checks.

### Phase 1 exit criteria

- ChatGPT uses the shared `src/browser/` mechanics and `src/core/` protocol/factory contracts.
- No Gemini code is required to exercise the ChatGPT path.
- Existing ChatGPT-specific modules still own selectors, login, wire parsing, models, conversations, and tools.
- Offline tests pass with no changed behavior.

## 7. Phase 2: provider configuration and account integration

This phase updates the runtime and extension integration so Gemini is a first-class, isolated provider.

### Runtime changes

Update `src/providers/chatgpt-web/lifecycle/config.ts` and related config code:

- Replace the single `adapter: "chatgpt-web"` assumption with a discriminated provider configuration.
- Keep shared browser settings in common config.
- Add a `geminiWeb` provider section with only Gemini fields.
- Give Gemini separate storage-state, verification-marker, profile, and conversation paths.
- Reject ChatGPT tunnel fields in Gemini browser-only config.
- Keep strict unknown-field validation.

Update `src/providers/chatgpt-web/server/routes.ts` to use the core provider factory. Add provider-aware health/config fingerprints without exposing secrets.

Update `src/cli.ts`:

- Make help and login/setup messages provider-aware.
- Add an explicit Gemini Web setup/login path rather than silently changing ChatGPT commands.
- Keep `--tunnel-id`, runtime keys, connector names, and OpenAI URLs unavailable for Gemini.
- Ensure acknowledgements describe unofficial Gemini Web automation accurately.

### Extension changes outside runtime

Expected files under `packages/internet/src/`:

- `core/types.ts`: add a distinct Gemini Web account/provider type and input shape.
- `providers/registry.ts`: register the new provider identity.
- `providers/gemini-web/provider.ts`: register a browser-backed provider configuration.
- `providers/gemini-web/models.ts`: expose the capability-driven Gemini Web catalog.
- `providers/gemini-web/daemon/*`: use the shared local daemon protocol without OpenAI request injection or tunnel assumptions.
- `daemon/config.ts`: generalize only the owned daemon fields that are truly provider-neutral; keep tunnel validation exclusive to ChatGPT full mode.
- Account/config documentation and validation: distinguish `gemini-api` from `gemini-web`.

Do not modify the existing Google API provider to point at the browser runtime.

### Phase 2 exit criteria

- A Gemini Web account can be configured without an API key.
- A Gemini Web account cannot read ChatGPT/OpenAI storage state.
- A Gemini Web daemon cannot start in OpenAI full/tunnel mode.
- Existing `gemini-api` registration and model behavior are unchanged.
- Provider names and model IDs cannot collide between `gemini-api` and `gemini-web`.

## 8. Phase 3: implement Gemini Web browser surface

Add provider-specific browser modules under `src/browser/gemini-web/`.

### `login-state.ts`

- Validate regular, bounded JSON files.
- Allow only the minimum confirmed Gemini/Google origins.
- Preserve cookies/local storage fields required by Playwright.
- Reject unrelated origins and empty relevant state.
- Use a Gemini-specific marker version and capability payload.
- Never log cookie values or raw storage state.

### `login.ts`

- Open the configured Gemini URL in the dedicated Chrome profile.
- Wait for the evidence-based authenticated surface check.
- Handle timeout, sign-in interruption, and account-switching failure distinctly.
- Import and re-verify state before writing it to the Gemini account directory.
- Remove temporary login profiles only after the browser closes safely.

### `session.ts`

- Define Gemini home URL and stable semantic/accessibility locators.
- Implement composer-ready and authenticated-surface probes.
- Implement capability detection from the actual signed-in model picker.
- Avoid relying on localized visible text when a role, label, or stable attribute is available.

### `interactions.ts` and `completion.ts`

- Create/select a conversation.
- Render normalized text input.
- Implement model selection only for discovered supported models.
- Detect completion without duplicating streamed text.
- Implement stop/cancel and verify page state after cancellation.
- Dispose or discard a page when a turn leaves it in an unknown state.

### `wire-capture.ts` / transport

- Match only the confirmed Gemini transport.
- Parse incrementally and tolerate heartbeat/non-content frames.
- Emit normalized text/thinking/error/done events.
- Bound response size and parser work.
- Keep a DOM extraction path only if the transport cannot reliably expose all required output.

### Phase 3 exit criteria

- Login, new chat, text turn, streaming, completion, cancellation, and browser restart work against the disposable test account.
- Failure states map to stable runtime errors.
- No ChatGPT selectors, URLs, cookies, parsers, or model IDs are imported into Gemini modules.

## 9. Phase 4: implement Gemini adapter and conversation policy

Add `src/providers/gemini-web/` modules:

- `adapter.ts`: translate normalized requests into Gemini browser operations and emit normalized events.
- `content/`: provider-specific prompt, markdown, image/file policy, and output extraction.
- `transport/`: Gemini response framing and parser.
- `models/`: capability-driven model definitions and conservative context/output limits.
- `conversation/`: provider/account-scoped identity, atomic persistence, and one-to-one binding policy.
- `lifecycle/`: setup, doctor, capability refresh, and control operations.
- `server/`: provider assembly only; common HTTP behavior belongs in `src/core/`.

### Request policy

For the first milestone, reject with explicit unsupported errors when a request contains:

- local/MCP tools or tool-choice requirements;
- image/file content;
- structured-output requirements;
- unsupported reasoning controls;
- opaque encrypted/multi-agent payloads that cannot be translated safely.

Do not silently drop these fields.

### Conversation policy

- Namespace all persisted state by provider and account.
- Use the Pi session ID as the sole durable key and store only its native Gemini `/app/<chat-id>` URL.
- Create one Gemini chat on the first successful turn, then reopen that exact chat for every later turn in the Pi session.
- Reject continuation when the session mapping is missing and reject any attempted chat-ID change.
- Do not replay prior messages or maintain response-ID compatibility mappings.

### Phase 4 exit criteria

- The common HTTP Responses surface can route to either ChatGPT or Gemini by explicit configuration.
- Gemini events produce valid Responses output with no duplicate final text.
- Unsupported features fail before opening a browser where possible.
- The one-to-one Pi-session-to-Gemini-chat invariant is documented and tested.

## 10. Phase 5: tests and fixtures

Tests remain offline by default. Live browser tests must be separately gated and must never require credentials for the normal package test command.

### Shared-runtime tests

Update or add tests under `packages/internet/test/browser/` and runtime-boundary tests for:

- provider-neutral page leasing and turn cleanup;
- stage timeout and abort propagation;
- response capture disposal and parser errors;
- provider factory selection and unknown-provider rejection;
- normalized request/event mapping;
- provider/account state path isolation.

Existing tests to preserve while moving code include:

- `test/browser/session.test.ts`;
- `test/browser/turn.test.ts`;
- `test/browser/response-capture.test.ts`;
- `test/daemon/runtime-boundary.test.ts`.

### Gemini unit tests

Add provider-specific tests such as:

- `test/browser/gemini-web/login-state.test.ts`;
- `test/browser/gemini-web/session.test.ts`;
- `test/browser/gemini-web/transport.test.ts`;
- `test/providers/gemini-web/protocol.test.ts`;
- `test/providers/gemini-web/conversation.test.ts`;
- `test/providers/gemini-web/models.test.ts`;
- `test/daemon/gemini-web.test.ts`.

Fixtures must contain sanitized storage shapes, DOM fragments, accessibility snapshots, and redacted response frames. Never commit cookies, authorization headers, account IDs, prompts, uploads, or live conversation IDs.

### Live smoke test

Add a separately invoked smoke command or test gate with:

- explicit environment/config opt-in;
- a disposable account/profile;
- no recording of raw browser state;
- cleanup after the run;
- assertions for login, one text turn, streaming, cancellation, and doctor output.

Do not include it in routine `vitest --run` execution.

## 11. Verification sequence

Run checks from the appropriate package roots after each phase:

1. `npx vitest --run <affected-test-files>` in `packages/internet`.
2. `npm run typecheck` in `packages/internet/runtime`.
3. `npm run build` in `packages/internet/runtime` after runtime source changes, because consumers use the generated runtime bundle.
4. `tsgo --noEmit` from the repository root after extension integration changes.
5. `biome check --write --error-on-warnings <changed-files>` only for the final intentional formatting pass.
6. Review `git diff --check`, `git status --short`, generated bundle changes, lockfiles, and in-repository backup files.

Do not run credential-dependent or long-running live tests unless explicitly requested.

## 12. Delivery order

Keep changes reviewable and independently verifiable:

1. Shared protocol/browser extraction with ChatGPT characterization tests.
2. Core provider factory and common config/server routing.
3. Gemini account/config/provider registration, without browser turns.
4. Gemini login/state/capability probe.
5. Gemini text turn and transport parser.
6. Gemini conversation policy and Responses adapter.
7. Diagnostics, CLI polish, fixtures, and live smoke gate.
8. Documentation and changelog updates for the user-visible provider addition.

Do not publish Gemini model registration until the corresponding capability probe and smoke test pass.

## 13. Definition of done

- ChatGPT Web tests and existing full/browser-only behavior remain green.
- `gemini-api` remains unchanged and distinct from `gemini-web`.
- Gemini Web has isolated credentials, config, browser state, conversation state, logs, and model IDs.
- Every Pi session ID is durably and immutably linked one-to-one with one native Gemini chat ID.
- Shared mechanics live in `src/browser/` or `src/core/` and contain no provider assumptions.
- Gemini-specific behavior lives in `browser/gemini-web/` or `providers/gemini-web/`.
- Login, text streaming, cancellation, timeout containment, browser restart, and diagnostics are verified.
- Unsupported tools/images/structured output are explicitly rejected rather than silently ignored.
- Offline tests and runtime build/typechecks pass.
- Live smoke evidence is available without committing secrets.
- User-facing setup/help/provider documentation and the appropriate changelog entry are updated.
