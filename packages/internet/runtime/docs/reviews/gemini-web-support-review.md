# Gemini Web Support Review

**Date:** 2026-08-17
**Scope:** `@packages/internet/runtime/` and the extension integration points required to expose a browser-backed provider for `https://gemini.google.com`.
**Status:** Implemented. Paths beginning with `src/` are relative to `packages/internet/runtime/`.

## Implementation update

Live discovery verified authenticated account evidence, account-visible model selection, rendered DOM
streaming/completion, cancellation, and native conversation URLs. The browser-only text milestone now
uses one immutable mapping from each Pi session ID to exactly one Gemini `/app/<chat-id>` URL. Missing
or changed identity fails closed. Tools, files, images, structured output, reasoning controls, Full
mode, and tunnels remain explicitly unsupported for Gemini Web.

## Executive summary

The review found that the runtime was not provider-neutral enough to add Gemini Web as a small
adapter. Implementation subsequently moved normalized contracts and provider composition into core,
kept shared browser lifecycle primitives under `src/browser/`, and retained provider-owned login,
interaction, response, model, and conversation behavior.

Gemini Web is implemented as a **separate provider** behind those shared contracts. It is not a
selector branch inside `browser/chatgpt-web/`, and the existing Gemini API provider remains independent.

The first Gemini milestone should be **browser-only**: authenticated web conversations, text streaming, image input if the live UI probe confirms it, cancellation, and provider capability reporting. The existing OpenAI tunnel/MCP full mode must not be assumed to work on Gemini Web.

## Important distinction

The extension already has a Google API provider named `gemini-api`:

- `packages/internet/src/providers/google/provider.ts` uses the Generative Language OpenAI-compatible API and an API-key environment variable.
- `packages/internet/runtime/` currently serves ChatGPT Web through the OpenAI account/runtime path.

Gemini Web automation is a different authentication, transport, model catalog, failure, and terms-of-use surface. It needs a distinct provider/account identity; it must not reuse the Google API account shape or silently replace `gemini-api`.

## Current architecture findings

### Reusable foundations

- `src/browser/session.ts` provides a provider-neutral Playwright browser/context and bounded page pool.
- `src/browser/turn.ts` provides bounded turns, maintenance exclusion, cancellation, and stage timeouts.
- `src/browser/response-capture.ts` provides response listener ownership and parse/wait lifecycle.
- `src/providers/chatgpt-web/protocol/types.ts` already defines a useful Responses-shaped request/event boundary (`ParsedRequest`, `AdapterEvent`, usage, tool calls, and continuation state).
- `src/core/server.ts` is a provider-neutral Bun HTTP host.

These are useful primitives, but they do not make the provider implementation generic by themselves.

### Shared-logic placement rule

When ChatGPT behavior is proven provider-neutral, move it into the existing shared runtime areas:

- `src/browser/` for browser mechanics: browser/context lifecycle, page leasing, turn scheduling, stage timeouts, cancellation, response-listener ownership, and page cleanup.
- `src/core/` for non-browser runtime contracts and services: normalized request/event protocol types, provider registration/factory contracts, HTTP request handling, config/path validation, redaction, and common health-report structures.

Do not put provider behavior in these directories. Selectors, login flows, storage allowlists, prompt rendering, wire parsers, conversation IDs, model catalogs, and tool semantics remain under their provider namespace. Existing ChatGPT code should be moved only when a second provider demonstrates that the behavior is genuinely shared; otherwise it stays in `chatgpt-web/`.

### ChatGPT coupling that blocks a direct Gemini addition

| Area | Current evidence | Gemini implication |
| --- | --- | --- |
| Runtime configuration | `src/providers/chatgpt-web/lifecycle/config.ts` hard-codes `adapter: "chatgpt-web"`, `https://chatgpt.com`, a GPT model, ChatGPT capability fields, and `chatgptWeb` settings. | Add an explicit provider discriminator and provider-scoped configuration. Do not overload `appName`, `proAvailable`, or the OpenAI tunnel fields. |
| HTTP routing | `src/providers/chatgpt-web/server/routes.ts` constructs the ChatGPT adapter and ChatGPT lifecycle objects directly. | Route through a provider factory/registry. The request protocol can stay shared, while provider selection must be explicit and validated. |
| Browser login | `src/browser/chatgpt-web/login.ts` launches ChatGPT, verifies a ChatGPT composer/model control, and writes a ChatGPT-specific marker. | Gemini needs its own login/import/verification flow, storage-state schema, marker version, account-surface check, and profile isolation. Google sign-in redirects and required domains must be discovered and allowlisted deliberately. |
| Storage validation | `src/browser/chatgpt-web/login-state.ts` accepts only `chatgpt.com` and `openai.com` cookies/origins. | A copied allowlist is unsafe. Determine the minimum Gemini/Google auth and application origins from a real export, reject unrelated state, and keep ChatGPT/Gemini state files separate. |
| Selectors and interactions | `src/browser/chatgpt-web/session.ts`, `interactions.ts`, `completion.ts`, and `turn-driver.ts` encode ChatGPT selectors, composer behavior, reasoning controls, stop behavior, and turn completion. | Implement a sibling `browser/gemini-web/` surface. Prefer semantic/accessibility locators and narrow provider-specific probes; do not add Gemini selector alternatives to ChatGPT helpers. |
| Wire capture | `src/browser/chatgpt-web/wire-capture.ts` only recognizes ChatGPT `/backend-api/.../conversation` responses and `src/providers/chatgpt-web/transport/wire-response.ts` parses ChatGPT wire data. | First determine whether Gemini responses are exposed as fetch/SSE, WebSocket, or only DOM updates. Implement a Gemini parser/capture path only after recording the live traffic shape; keep a DOM fallback explicit if needed. |
| Prompt/content translation | `src/providers/chatgpt-web/content/prompt.ts` and related content modules translate the incoming request for ChatGPT Web. | Gemini may differ in markdown, image upload, file handling, thinking display, and context limits. Share only provider-independent normalization; keep Gemini rendering and extraction separate. |
| Conversation state | Journal/sync/canary modules under `src/providers/chatgpt-web/conversation/` and the ChatGPT worker use ChatGPT URLs and provider-private continuation assumptions. | Use provider/account-scoped durable state. The verified native Gemini URL is bound immutably to the Pi session; continuations send only the current user suffix and never replay history or reuse ChatGPT continuation IDs. |
| Tool mode | Full mode is built around an OpenAI tunnel, ChatGPT connector, MCP broker, and ChatGPT “Allow once” UI flow. | Treat Gemini Web as browser-only until an independently designed tool contract is proven. Do not expose local tools merely because the shared request contains tools. |
| Model catalog | `src/providers/chatgpt-web/lifecycle/config.ts` advertises one hard-coded GPT model and `packages/internet/src/providers/openai/turn/model.ts` maps ChatGPT Web routes/reasoning levels. | Add a Gemini Web catalog based on observed UI model labels and tested capabilities. Do not infer web model IDs, context windows, token limits, or thinking levels from the Gemini API catalog. |
| Setup and CLI | `src/cli.ts` text, login commands, setup modes, tunnel URLs, connector names, and acknowledgement language all say ChatGPT/OpenAI. | Add provider-specific commands/options or a provider-aware command layer. Gemini setup must not require or accept OpenAI tunnel credentials. |
| Diagnostics | ChatGPT lifecycle doctor and capability probes assume the ChatGPT composer and Sol/reasoning control. | Add Gemini health checks for browser engine, state validity, signed-in surface, composer, response completion, and capability discovery. Report provider/account names in every diagnostic. |
| Extension integration | `packages/internet/src/providers/openai/*` exposes the runtime as an OpenAI provider; `packages/internet/src/providers/google/*` exposes `gemini-api`. | Decide whether a browser-backed Gemini account gets a new account/provider kind or a clearly separate web provider registration. The current `InternetProviderId` union is not sufficient as-is. |

## Required live discovery before implementation

The following facts cannot be safely inferred from the current source and should be recorded against a disposable test account/profile:

1. Login redirects, MFA/passkey behavior, consent pages, and the minimum cookie/local-storage origins needed after sign-in.
2. Stable authenticated URL and a reliable composer-ready signal.
3. How a new chat and an existing chat are identified and reopened.
4. Whether text, thinking/reasoning, citations, and usage arrive through DOM, fetch/SSE, WebSocket, or a mixture.
5. How model selection is represented and which models are available to the account.
6. Image/file input behavior, upload completion, and supported MIME types.
7. Stop/cancel behavior and whether a stopped turn leaves recoverable partial output.
8. Error states for quota, safety refusal, sign-in expiry, rate limiting, network loss, and model unavailability.
9. Whether browser automation remains usable with multiple tabs and whether account/session state is safe to share across concurrent turns.
10. Whether any Gemini Web feature can invoke arbitrary user-provided tools. If not proven, tools remain unsupported in the first milestone.

The discovery harness should capture redacted DOM snapshots, accessibility trees, selected request metadata, response framing, and timing—not raw cookies, authorization headers, or user content.

## Recommended target shape

### Shared layer placement

The target is not a new generic provider folder. Shared logic should land in the existing runtime boundaries:

| Shared concern | Target location | Notes |
| --- | --- | --- |
| Browser/context lifecycle and page leasing | `src/browser/` | Refine `session.ts` only as needed; no provider URLs or selectors. |
| Turn scheduling, stage timeout, abort, and cleanup | `src/browser/` | Extract reusable pieces from ChatGPT worker/turn execution. |
| Response listener ownership | `src/browser/` | Reuse `response-capture.ts`; provider parsers remain outside it. |
| Normalized request/event types | `src/core/` | Move the provider-neutral portion of `protocol/types.ts` out of `chatgpt-web`. |
| Provider adapter/factory contracts | `src/core/` | Extend `ProviderAdapter` beyond `runTurn` only where lifecycle boundaries are genuinely shared. |
| HTTP request parsing and Responses response streaming | `src/core/` | Keep provider selection and provider-specific translation outside the shared HTTP host. |
| Config/path validation, atomic files, redaction, health reports | `src/core/` | Provider-specific fields and checks remain in provider lifecycle modules. |

The existing `ProviderAdapter` interface is a useful starting point, but it currently describes only `runTurn`. Login, capability discovery, setup, diagnostics, conversation identity, and transport selection should be exposed through provider-owned interfaces or narrow shared contracts rather than copied into Gemini.

### Provider layer

Add a sibling Gemini Web implementation with separate modules for:

- `src/browser/gemini-web/` — Gemini URL constants, selectors, login verification, interactions, completion, and optional wire capture;
- `src/providers/gemini-web/` — adapter, prompt/content translation, request parser, model catalog, conversation policy, diagnostics, and routes;
- provider-specific storage and verification markers;
- provider-specific tests and fixtures with secrets/content removed.

Keep ChatGPT behavior unchanged while the Gemini path is introduced. A provider registry/factory in `src/core/` should reject unknown adapters and ensure that config, state paths, diagnostics, and model catalogs agree on the same provider.

### Initial scope recommendation

**Milestone 1: browser-only, text-first**

- explicit Gemini Web account/login;
- one authenticated account per isolated storage state;
- new and resumed conversations only with verified immutable native identity;
- text input/output and streaming;
- cancellation and clear failure mapping;
- capability-driven model registration;
- no local tools, OpenAI tunnel, connector, or MCP claims;
- image input only after a verified upload path is tested.

**Later milestones:** richer multimodal input, citations/usage fidelity, durable continuation, and any tool support. Each requires a separate acceptance test rather than inheriting ChatGPT behavior.

## Porting map from ChatGPT Web

| Current ChatGPT area | Action for shared logic | Gemini update |
| --- | --- | --- |
| `src/browser/session.ts` | Reuse from `src/browser/`; change only for provider-neutral needs. | Supply Gemini storage path and page keys. |
| `src/browser/turn.ts` | Reuse from `src/browser/`; keep provider out of scheduling and timeout code. | Use the same cancellation and cleanup guarantees. |
| `src/browser/response-capture.ts` | Reuse from `src/browser/`; keep parser callbacks provider-owned. | Add a Gemini capture/parser only after transport discovery. |
| `src/providers/chatgpt-web/protocol/types.ts` | Move common request/event definitions to `src/core/`. | Map Gemini output into the same normalized events. |
| ChatGPT worker and turn execution | Extract only scheduling, abort, cleanup, and event plumbing into `src/browser/` or `src/core/`. | Implement Gemini submission/completion as a provider driver. |
| ChatGPT login/state modules | Do not share implementation. | Add Gemini login, Google/Gemini origin validation, marker, and expiry checks. |
| ChatGPT prompt/content modules | Do not copy blindly. | Add Gemini-specific rendering, uploads, and output extraction. |
| ChatGPT wire transport | Keep ChatGPT parser in its namespace. | Discover and implement Gemini’s actual fetch/SSE/WebSocket/DOM path. |
| ChatGPT conversation journal | Share only generic file locking, atomic persistence, and redaction in `src/core/`. | Define Gemini conversation identity and replay policy separately. |
| ChatGPT lifecycle/setup/doctor | Keep provider policy isolated; share only core config/process primitives. | Add Gemini browser login/capability discovery, diagnostics, and provider-specific errors. |

The implementation should move code before duplicating it, but only after tests demonstrate that the extracted behavior has no ChatGPT assumptions. Every extraction must leave ChatGPT tests passing before Gemini-specific work continues.

## Acceptance criteria for implementation planning

A Gemini Web implementation should not be considered ready when it merely produces one successful answer. At minimum it must demonstrate:

- clean login/import with no cross-provider cookie leakage;
- doctor output that distinguishes missing state, expired auth, unavailable composer, and browser failure;
- deterministic model/capability reporting from the signed-in account;
- streamed text with correct completion and no duplicated final text;
- timeout, cancellation, page disposal, and browser restart containment;
- fresh and resumed conversation behavior without history replay;
- safe rejection of unsupported tools, images, structured output, and other features;
- account/provider-scoped logs that redact secrets and prompt content;
- unit tests for storage validation, parser framing, request/event mapping, and state isolation;
- an end-to-end smoke test against a manually provisioned test account, kept separate from the normal offline test suite.

## Files reviewed

Primary runtime source:

- `src/browser/session.ts`, `src/browser/turn.ts`, `src/browser/response-capture.ts`;
- `src/browser/chatgpt-web/*`;
- `src/providers/chatgpt-web/*`, especially lifecycle config/setup/doctor, server routes, protocol types, conversation, turn, and transport;
- `src/cli.ts` and `src/core/*`.

Integration source:

- `packages/internet/src/core/types.ts`;
- `packages/internet/src/providers/registry.ts`;
- `packages/internet/src/providers/openai/*`;
- `packages/internet/src/providers/google/*`.

Existing source-mirrored runtime documentation was checked; the listed Internet package tests identify the test seams that should be extended during implementation. This document intentionally does not change source, generated output, lockfiles, or changelogs.
