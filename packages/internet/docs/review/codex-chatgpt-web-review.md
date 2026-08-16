# Former `codex-chatgpt-web` Runtime Review

Status: **implemented; breaking migration complete**.

This review covers the former `packages/internet/vendor/codex-chatgpt-web/` runtime, now owned as
`packages/internet/vendor/runtime/`. The old upstream snapshot metadata and package identity were
removed; the runtime source and build output are now Pi-owned.

## Boundary

The current snapshot is a self-contained Bun runtime, but that is not the target ownership model.
The target is a neutral runtime package under `packages/internet/vendor/runtime/`. Its `src/`
root contains provider-agnostic runtime code. Codex- and ChatGPT-specific behavior is confined to
`src/adapters/chatgpt-web/`, behind explicit adapter interfaces.

The neutral runtime owns:

- account-scoped configuration and state contracts;
- daemon lifecycle and process control;
- HTTP and Responses-runtime plumbing;
- generic event, process, body, usage, and error utilities;
- runtime packaging and health boundaries.

The ChatGPT adapter owns browser sessions, turns, wire capture, tool execution, login, model
capabilities, ChatGPT conversation state, and any Codex-specific translation required by that
adapter. The daemon may remain process-isolated for reliability and browser/runtime containment;
process isolation is an implementation boundary, not a provider identity.

## Findings

### 1. The source has useful domain groupings, but the ownership boundary is wrong

The snapshot separates several domains, but it still exposes an upstream-shaped runtime package:

- `src/adapters/chatgpt-web/` already contains the main provider-specific behavior, but should be
  split further by browser, conversation, wire, tools, login, and model capability;
- `src/responses/` contains Codex/Responses-specific translation and should be classified before
  being retained in neutral core or moved under the adapter;
- `src/lib/` contains mostly reusable low-level utilities and is the strongest neutral-core seam;
- top-level modules mix runtime, configuration, service, tunnel, CLI, and upstream Codex/ChatGPT
  concerns and require explicit classification.

The target is not merely a directory rename. Every module must be classified as neutral runtime or
ChatGPT adapter code, and neutral modules must not import provider-specific names.

### 2. A few files are coordination hotspots

The following files are large because they coordinate multiple phases of an intentionally coupled
runtime. They are the primary candidates for a future internal decomposition:

- `src/adapters/chatgpt-web/browser-worker.ts`: browser lifecycle, page interaction, wire capture,
  tool approval, and response recovery;
- `src/adapters/chatgpt-web/responses/bridge.ts`: adapter events, Responses output, and continuation
  state;
- `src/adapters/chatgpt-web/config.ts`: ChatGPT configuration, setup defaults, and validation;
- `src/adapters/chatgpt-web/types.ts`: adapter protocol/domain types and tool helpers.

These are maintainability hotspots and extraction seams. The split should produce one authoritative
implementation behind the neutral runtime contract and the ChatGPT adapter contract, without
preserving the upstream package's public entry points.

### 3. Compatibility paths are explicitly out of scope for the new implementation

The approved migration is a breaking change. The new Pi implementation will not read or migrate
legacy `pi-internet-runtime` configuration, integration journals, browser state, conversation state,
old CLI aliases, or upstream compatibility formats. Existing installations must be reconfigured
through the Pi account and daemon workflow.

Only behavior required by the current Pi provider contract is retained. Browser DOM extraction,
legacy journal versions, old Codex environment shapes, vendor-specific wrappers, and fallback
branches must not survive the migration unless the implementation plan identifies a current Pi
requirement with focused regression coverage.

## Implemented direction

1. Renamed the runtime package to `packages/internet/vendor/runtime/` and removed the vendor import
   alias and upstream snapshot metadata.
2. Moved ChatGPT/Codex-specific configuration, setup, diagnostics, routes, Responses translation,
   types, browser, login, model, tunnel, passthrough, image, and search modules beneath
   `vendor/runtime/src/adapters/chatgpt-web/`.
3. Removed upstream Codex route integration, journal migration, and route CLI commands.
4. Renamed neutral runtime identity, launcher, environment variable, and account fallback paths.
5. Updated parent build scripts, daemon launcher fixtures, tests, and documentation.
6. Kept process isolation and the existing Pi daemon/provider contract intact.

## Review disposition

The documented breaking migration is implemented. The detailed file matrix and verification record
are maintained in [`daemon-boundary.md`](daemon-boundary.md).
