# Former `codex-chatgpt-web` Runtime Review

Status: **implemented; breaking migration complete**.

This review covers the former `packages/internet/vendor/codex-chatgpt-web/` runtime, now owned as
`packages/internet/vendor/runtime/`. The old upstream snapshot metadata and package identity were
removed; the runtime source and build output are now Pi-owned.

## Boundary

The current snapshot is a self-contained Bun runtime, but that is not the target ownership model.
The target is a neutral runtime package under `packages/internet/vendor/runtime/`. Its `src/core/`
contains provider-agnostic runtime code. Codex- and ChatGPT-specific behavior is organized by feature
under `src/providers/chatgpt-web/`, behind explicit adapter interfaces.

The neutral runtime owns:

- runtime paths and durable command validation;
- process/service lifecycle and HTTP hosting;
- bounded event, body, and process primitives;
- runtime packaging boundaries.

The ChatGPT adapter owns browser sessions, turns, wire capture, tool execution, login, model
capabilities, ChatGPT conversation state, and any Codex-specific translation required by that
adapter. The daemon may remain process-isolated for reliability and browser/runtime containment;
process isolation is an implementation boundary, not a provider identity.

## Findings

### 1. The source has useful domain groupings, but the ownership boundary is wrong

The snapshot separates several domains, but it still exposes an upstream-shaped runtime package:

- `src/providers/chatgpt-web/` contains provider behavior organized by browser, conversation, content,
  lifecycle, models, protocol, tools, transport, and turn;
- `src/core/` contains only reusable runtime primitives;
- `cli.ts` is the sole composition root;
- core modules do not import provider-specific names.

The target is not merely a directory rename. Every module is classified into `core/` or a feature
folder under the ChatGPT adapter, and core modules must not import provider-specific names.

### 2. A few files are coordination hotspots

The previous browser worker has been decomposed: `worker.ts` owns lifecycle and maintenance,
`turn-driver.ts` composes stages, and interactions, completion, diagnostics, and wire capture have
cohesive modules under `src/browser/chatgpt-web/`. The remaining intentionally coupled module is:

- `src/providers/chatgpt-web/protocol/responses/bridge.ts`: adapter events, Responses output, and continuation
  state;
- `src/providers/chatgpt-web/lifecycle/config.ts`: ChatGPT configuration, setup defaults, and validation;
- `src/providers/chatgpt-web/protocol/types.ts`: adapter protocol/domain types and tool helpers.

These are maintainability hotspots and extraction seams. The split produces one authoritative implementation behind the neutral runtime and ChatGPT adapter
contracts, without preserving upstream package entry points.

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
   `vendor/runtime/src/providers/chatgpt-web/`.
3. Removed upstream Codex route integration, journal migration, and route CLI commands.
4. Renamed neutral runtime identity, launcher, environment variable, and account fallback paths.
5. Updated parent build scripts, daemon launcher fixtures, tests, and documentation.
6. Kept process isolation and the existing Pi daemon/provider contract intact.

## Review disposition

The documented breaking migration is implemented. The detailed file matrix and verification record
are maintained in [`daemon-boundary.md`](daemon-boundary.md).
