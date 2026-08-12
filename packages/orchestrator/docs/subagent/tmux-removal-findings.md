# Tmux Removal Findings

Status: implemented.

Goal: remove the tmux execution backend from `packages/orchestrator/src/subagent/` because the agent tools are now transparent enough that a separate tmux worker backend is no longer needed.

Decision (confirmed): keep `subagent_inspect` as a native-only tool — the durable record and artifact paths are what make subagent work transparent. Remove only the tmux-only live controls `subagent_attach` and `subagent_kill`.

This document records the review that guided removal of the subagent tmux backend. The implementation now uses native execution exclusively and retains `subagent_inspect` for durable transparency. Sections 1–8 preserve the pre-removal inventory and implementation checklist; section 9 records the final decisions.

---

## 1. Summary of the tmux backend

The subagent subsystem supports two execution backends selected by `visibility`:

- `native` — the subagent runs in-process via `SubagentManager.runRecord` / `executeRecord`, using an isolated `AgentSession`. This is the default and the only path used by the worker.
- `tmux` — the subagent is launched as a separate `pi subagent-worker` process inside a tmux pane/session. The parent writes a `request.json`, spawns tmux, records a `TmuxMetadata` + `RunIdentity`, and later exposes `inspect` / `attach` / `kill` live controls that shell out to tmux.

The tmux path is entirely opt-in: it is only reached when a caller passes `visibility: "tmux"` on a `SubagentRequest`. The `native` path never touches tmux. Removing tmux therefore means removing the `tmux` visibility branch, the worker process, the run-identity machinery, and the live-control tools that only make sense for tmux-backed runs.

---

## 2. Files that are entirely tmux-owned (removable)

These files exist only to support the tmux backend. Removing tmux deletes them outright.

| File | Role |
|------|------|
| `src/subagent/tmux.ts` | `TmuxTarget`, `TmuxSessionTarget`, `TmuxPaneTarget`, `TmuxMetadata` types and `buildTmuxCommands()`. |
| `src/subagent/tmux-launch.ts` | `buildTmuxSubagentLaunchPlan()`, `isTmuxCommandAvailable()`, `PI_SUBAGENT_TMUX_TARGET_KIND_ENV`. Builds the `tmux split-window`/`new-session` command and the inner `pi subagent-worker` command. |
| `src/subagent/tmux-backend.ts` | `TmuxBackend` class + `TmuxBackendOptions`, `TmuxUnavailableError`, `SubagentWorkerMetadata`, tmux spawn/parse/inspect/attach/kill logic. |
| `src/subagent/subagent-worker.ts` | The `pi subagent-worker` package command entrypoint: `readSubagentWorkerRequest`, `runSubagentWorkerRequest`, `handlePackageCommand`, `SubagentWorkerMetadataInvalidError`. |
| `src/subagent/run-identity.ts` | `RunIdentity`, `RunIdentityOwner`, `createRunIdentity`, `isRunIdentity`, `recordMatchesIdentity`. Identity is only used to validate tmux worker metadata before attach/kill. |
| `src/subagent/run-identity.schema.json` | JSON schema for `RunIdentity` (includes `tmuxMetadata`, `tmuxTarget`, `tmuxPaneTarget`, `tmuxSessionTarget`). |

### 2.1 `subagent-worker.ts` is a registered package command

`packages/orchestrator/package.json` declares it as a Pi package command:

```json
"pi": {
  "commands": [
    "dist/subagent/subagent-worker.js"
  ]
}
```

Removing the tmux backend removes this command registration too. The `subagent-worker` command is only ever invoked by the tmux launch plan; nothing else calls it.

---

## 3. Files that reference tmux but are not tmux-owned (must be edited)

These files are core subagent infrastructure and survive, but their tmux references must be stripped.

### 3.1 `src/subagent/types.ts`

- `export type Visibility = "native" | "tmux"` → becomes `"native"` only (or the type is removed entirely).
- `export type BackendKind = Visibility` → collapses to `"native"`.
- `SubagentRequest.visibility?: Visibility` → removable (no backend selection left).
- `SubagentRecord.visibility?: Visibility` → removable.
- `SubagentRecord.tmux?: TmuxMetadata` → removable.
- `SubagentRecord.identity?: RunIdentity` → removable.
- `InspectResult` → **kept**, but strip the tmux-only fields: remove `workerMetadataPath` and `meta` (which carried `tmux`/`identity`). Keep `ok`, `record`, `artifactPath`, `reason`.
- `AttachResult` → removable (tmux-only).
- `KillFailureReason` and `KillResult` → removable (tmux-only).
- `SubagentControls` interface → replaced by focused `SubagentInspection` with `inspect` only.
- `WorkerRequest` interface → only used by the worker; removable.

### 3.2 `src/subagent/manager.ts`

- `import { TmuxBackend, type TmuxBackendOptions }` → removable.
- `resolveBackend(visibility)` → removable (always native).
- `SubagentManagerOptions.tmux?: TmuxBackendOptions` → removable.
- `buildSubagentObservabilityPrompt` — the `visibility` param and the tmux guidance lines ("prefer an explicit tmux session over a detached background process", "When you start or recommend tmux-backed work...") → removable. The observability prompt becomes native-only.
- `private readonly tmuxBackend` field + constructor wiring → removable.
- `spawn()` — the `if (backendKind === "tmux") return this.tmuxBackend.spawn(...)` branch → removable; always the native path.
- `runWorkerRequest(worker)` → only used by the worker; removable.
- `inspect()` — the `record.tmux ? { ...result, ...this.tmuxBackend.inspect(record) }` branch → removable. Keep the native-only inspect that returns `record` + `artifactPath`.
- `attach()` → tmux-only; removable.
- `kill()` → tmux-only; removable.
- `SubagentManager` implements the focused `SubagentInspection` contract in addition to `SubagentManagerApi`.

### 3.3 `src/subagent/inspection.ts`

Replaces the former mixed `tools.ts` and `controls.ts` modules. Registers only `subagent_inspect` and resolves the manager directly from the registry.

### 3.4 `src/subagent/tool-names.ts`

`SUBAGENT_TOOL_NAMES` includes `subagent_inspect`, `subagent_attach`, `subagent_kill`. **Keep `subagent_inspect`**; remove the `subagent_attach` and `subagent_kill` entries.

### 3.5 Removed mixed control modules

The former `tools.ts` and `controls.ts` modules were removed. Inspection now has one focused owner in `inspection.ts`.

### 3.6 `src/subagent/receipts.ts`

The receipt attachment helper remains for `subagent_inspect` and is named `attachInspectionReceipt` to match its focused responsibility.

### 3.7 `src/subagent/manager-api.ts`

`SubagentManagerApi` remains focused on lifecycle operations. Durable inspection is exposed by the concrete manager through `SubagentInspection`.

### 3.8 `src/subagent/runtime.ts`

`registerSubagentRuntime` calls `registerSubagentInspection(host)` to register the retained `subagent_inspect` tool.

### 3.9 `src/index.ts`

Re-exports `registerSubagentInspection` from the focused `inspection.ts` module. No tmux-only types or control registrations remain.

---

## 4. Shared `@tsuuanmi/pi/tmux` module (NOT removable)

`packages/pi/src/cli/tmux.ts` exports `resolveTmuxCommand`, `resolvePiCommand`, `sanitizeTmuxToken`, `shellQuote`, `commandAvailable`, `PI_TMUX_LAUNCHED_ENV`, and tmux spawn types. It is exported as `@tsuuanmi/pi/tmux`.

This module is **not** subagent-owned. It is used by:

- `packages/pi/src/cli/launch-tmux.ts` — the `pi --tmux` interactive startup feature (a separate, user-facing feature).
- `packages/pi/src/main.ts` — calls `launchDefaultTmuxIfNeeded`.
- `packages/pi/src/cli/args.ts` — the `--tmux` CLI flag and help text.

The subagent subsystem imports only `resolveTmuxCommand` and the `TmuxSpawnSync` type from it. Removing the subagent tmux backend removes those imports, but the `@tsuuanmi/pi/tmux` module itself and the `pi --tmux` feature must stay. Do not delete `packages/pi/src/cli/tmux.ts` or `launch-tmux.ts`.

---

## 5. Tests that must change

| Test file | What changes |
|-----------|--------------|
| `test/subagent/tmux-launch.test.ts` | Entire file is tmux-launch-specific. Delete. |
| `test/subagent/manager.test.ts` | Remove the tmux tests: the "launches explicit tmux visibility through the worker backend" test, the "applies tmux kill failure precedence" test, and the "returns tmux_unavailable when explicit tmux visibility is requested without tmux" test. Also remove the `readSubagentWorkerRequest` import and any tmux fixture helpers (`tmuxFor`, `writeTmuxRecord`, `identityFor`). Update the observability-prompt assertion that checks for "prefer an explicit tmux session over a detached background process". Keep any `subagent_inspect` assertions that check record/artifact paths (they remain valid native behavior). |

---

## 6. Docs that must change

| Doc | What changes |
|-----|--------------|
| `docs/subagent/index.md` | Remove all tmux-backend references: the "native execution, and tmux controls" intro, the observability-prompt tmux guidance, and the final paragraph describing tmux-backed inspect/attach/kill controls. |
| `docs/subagent/agent-management-contracts.md` | Remove the worktree/tmux orchestration references and the "Worktree/tmux gate" section, or update it to reflect that tmux is removed. |
| `README.md` | Remove "native/tmux backends" from the package-scope description. |
| `CHANGELOG.md` | Add a `Removed` entry for the tmux subagent backend. |

---

## 7. Behavior and risk notes

- **Default behavior unchanged.** `native` is the default and the only path used in practice by the worker and by normal spawns. Removing tmux only removes an opt-in path.
- **`visibility: "tmux"` becomes unsupported.** Any external caller passing `visibility: "tmux"` would need to stop doing so. Search the repo for `visibility: "tmux"` outside `test/` — currently only tests use it, so no production caller is affected.
- **`subagent_attach` / `subagent_kill` tools disappear.** These are tmux-only live controls. If any workflow or extension relies on them, that is a breaking change. `subagent_inspect` is **kept** as a native-only tool that returns the durable record and artifact paths — this is what makes subagent work transparent.
- **`RunIdentity` / worker metadata** exist solely to validate tmux worker identity before attach/kill. With tmux gone, they are dead weight.
- **The `pi subagent-worker` package command** is removed from `package.json` `pi.commands`.
- **`@tsuuanmi/pi/tmux` and `pi --tmux`** are unrelated user-facing features and must be preserved.

---

## 8. Suggested removal order

1. Delete `tmux.ts`, `tmux-launch.ts`, `tmux-backend.ts`, `subagent-worker.ts`, `run-identity.ts`, `run-identity.schema.json`.
2. Strip tmux from `types.ts`; retain focused `InspectResult` and `SubagentInspection` contracts.
3. Strip tmux from `manager.ts` (backend field, spawn branch, `runWorkerRequest`, inspect/attach/kill, observability prompt).
4. Replace mixed `tools.ts`/`controls.ts` with focused `inspection.ts`; keep only `subagent_inspect` in `tool-names.ts` and runtime registration.
5. Update `index.ts` re-exports and `package.json` `pi.commands`.
6. Delete `test/subagent/tmux-launch.test.ts`; strip tmux tests from `manager.test.ts`.
7. Update docs and `CHANGELOG.md`.
8. Rebuild `dist` (`npm run build` in `packages/orchestrator`) and run `tsgo --noEmit` + `biome check` + targeted `vitest`.

---

## 9. Review decisions

- `visibility` was removed from `SubagentRequest` and `SubagentRecord`; native execution is authoritative.
- No external source consumer imported the removed tmux-only symbols.
- `subagent_inspect` remains and returns the durable record plus artifact path.
- `subagent_attach` and `subagent_kill` were removed with the tmux backend.
