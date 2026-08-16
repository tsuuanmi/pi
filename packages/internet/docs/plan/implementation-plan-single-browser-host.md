# Implementation Plan — Single Canonical Browser Host

**Status:** Implemented (2026-08-16)
**Scope:** `@tsuuanmi/pi-internet` and its vendored browser runtime
**Decision:** Use package-owned managed Chrome as the only browser host.

## 1. Goal

Make the package provider-agnostic at its shared boundaries while keeping one canonical browser
implementation for the current browser-backed provider:

- Pi owns and launches system Chrome through the package daemon.
- The ChatGPT Web provider adapter owns ChatGPT-specific browser automation.
- API providers remain browserless and continue to use their native provider transports.
- No package or runtime configuration selects between browser hosts.
- The external Codex Web GPT launcher and its CDP attachment path are removed.

The package remains extensible through provider adapters; future providers must not depend on
ChatGPT, Codex, launcher, CDP descriptor, or browser-host configuration types.

## 2. Terminology and boundaries

### Shared package boundary

The shared provider contract covers provider identity, model metadata, account routing, request
registration, and credentials. It must not expose:

- `BrowserHostMode`
- `browserHost`
- `browserHostDescriptorPath`
- launcher process ownership
- launcher CDP descriptors
- ChatGPT-specific browser login or conversation state

### ChatGPT Web provider boundary

The ChatGPT Web adapter may own:

- managed Chrome launch and connection
- ChatGPT login and storage-state verification
- ChatGPT conversation tabs and durable conversation journals
- ChatGPT model routing and browser-turn capture

Managed Chrome is an implementation detail of this adapter, not a generic provider capability.

### API provider boundary

Anthropic, Google, and future API providers remain browserless. Their account records contain only
provider-specific routing and environment-variable credential references.

## 3. Canonical configuration

The daemon configuration must contain no browser-host selector and no schema-version field.
Managed Chrome is implicit and always used. The canonical generated configuration should retain
only the managed-browser fields, for example:

```json
{
  "mode": "browser-only",
  "chromeExecutablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "storageStatePath": ".../browser/storage-state.json",
  "conversationStateDir": ".../conversations"
}
```

The final schema must omit `version`, `browserHost`, and `browserHostDescriptorPath`.
Validation must not check a configuration version; it should validate the actual required fields and
reject unsupported fields where strict validation applies.

Because this is an intentional canonical-schema change, do not add compatibility migration or
silent cleanup. Existing launcher configurations and old selector-bearing daemon configurations
must be recreated through setup. Obsolete fields should be rejected clearly.

The account registry remains strict. It must continue rejecting unsupported account fields rather
than accepting legacy browser-mode metadata.

## 4. Implementation sequence

### Phase 1 — Establish the canonical daemon schema

1. Remove `BrowserHostMode` from the vendored runtime configuration types.
2. Remove the configuration `version`, `browserHost`, and `browserHostDescriptorPath` fields from
   `AppConfig` and provider config types.
3. Make `defaultConfig()` generate managed-Chrome settings without a version or browser-host
   selector.
4. Remove configuration-version checks while retaining required-field and unsupported-field
   validation.
5. Make config validation reject old launcher/descriptor fields with an actionable setup message.
6. Keep the Pi-owned daemon config writer aligned with the vendored runtime schema.

### Phase 2 — Remove launcher ownership and CDP attachment

Remove the launcher-only paths from the vendored runtime:

- `launcher-browser-host.ts`
- launcher descriptor parsing and permission checks
- launcher CDP connection and page selection
- launcher helper process coordination
- launcher-specific setup flags and handoff logic
- launcher-specific doctor checks
- launcher branches in `browser-worker.ts`
- launcher-only fields in adapter/provider configuration

The browser worker should always use the existing managed-Chrome launch path. It must preserve
headed operation, dedicated storage state, per-session conversation isolation, idle cleanup, and
graceful shutdown.

### Phase 3 — Keep provider-specific code out of shared modules

1. Keep `OwnedDaemonManager` narrowed to `OpenAiInternetAccount` because the current browser provider
   is ChatGPT Web.
2. Keep Anthropic and Google registration independent of daemon lifecycle.
3. Keep the `ProviderAdapter` seam as the extension point for future browser-backed providers.
4. Move any remaining launcher/browser-host references that are needed only by ChatGPT into the
   ChatGPT adapter boundary rather than shared core types.
5. Ensure generic tools, council selection, and account APIs operate on provider IDs and model
   metadata, not browser-host modes.

### Phase 4 — Recreate canonical local configuration

For development and release verification:

1. Delete/recreate daemon configs created by the old schema; do not migrate them in code.
2. Keep browser login state and durable conversation journals only if the new managed-Chrome layout
   can safely reuse them.
3. Re-run package-owned setup/login where the old launcher configuration owned the browser session.
4. Verify the generated config contains only the canonical managed-Chrome schema.

No automatic launcher-to-managed-Chrome handoff is required. The user-visible error should explain
that setup must be rerun when an old configuration is found.

### Phase 5 — Documentation and changelog

Update the current documentation to:

- describe managed Chrome as the only browser host;
- remove launcher mode and CDP descriptor instructions;
- state that browser host configuration is ChatGPT-adapter internal behavior;
- distinguish browser-backed ChatGPT Web from browserless API providers;
- document setup/config recreation for old launcher configurations;
- update the package changelog under the appropriate breaking-change/removal section.

Update source-mirror documentation and architecture diagrams so they do not claim that the package
supports two browser hosts.

## 5. Tests and acceptance criteria

### Configuration tests

- Default config contains no version, browser-host selector, or launcher descriptor path.
- Config validation performs no version check.
- Launcher configurations fail with the setup/recreate error because they contain unsupported fields.
- Unknown configuration fields remain rejected where strict validation applies.

### Browser/runtime tests

- Managed Chrome launch, connection, storage-state loading, login verification, and shutdown pass.
- Browser turns still preserve one durable conversation per Pi session.
- Idle cleanup and concurrent-turn limits remain unchanged.
- No launcher descriptor, CDP attachment, or helper process is required.

### Provider tests

- Anthropic and Google provider tests remain browserless.
- ChatGPT Web provider tests still route through the managed daemon.
- Generic provider registration and council tests do not import browser-host types.
- A future provider can implement the provider boundary without importing ChatGPT runtime modules.

### Static and repository checks

- `cd packages/internet && PATH="$HOME/.bun/bin:$PATH" npm run build`
- `cd packages/internet && npx vitest --run`
- `tsgo --noEmit`
- `biome check --write --error-on-warnings packages/internet`
- Review `git diff`, package contents, generated runtime output, and config examples.
- Confirm no launcher references remain outside explicitly historical design records.

## 6. Non-goals

- Do not add a generic browser abstraction before a second browser-backed provider exists.
- Do not make API providers launch or depend on Chrome.
- Do not preserve launcher compatibility through aliases, fallback branches, or silent migration.
- Do not change provider credentials, model catalogs, durable conversation semantics, or council
  orchestration as part of this browser-host removal.

## 7. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Existing launcher users lose their browser host | Fail clearly and require explicit setup/recreation; do not silently switch ownership. |
| Config schema drift between Pi and vendored runtime | Keep one canonical field contract and test both generated and parsed config. |
| Provider-agnostic core regresses into ChatGPT coupling | Enforce adapter imports and keep browser types out of shared provider modules. |
| Removing launcher code breaks managed Chrome | Run the full internet package suite and managed-Chrome runtime smoke checks. |
| Documentation retains obsolete launcher instructions | Search all package docs and source references before finalizing. |

## 8. Completion definition

The task is complete when managed Chrome is the only supported browser host, launcher configuration
is rejected rather than migrated, shared provider APIs contain no browser-host concept, all current
providers retain their existing behavior, documentation describes the new boundary, and the full
internet package verification suite passes.
