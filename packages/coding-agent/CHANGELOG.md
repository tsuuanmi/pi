## [Unreleased]

### Breaking Changes

- Removed image-related features from the MVP scope, including `ImageContent` public APIs, terminal image rendering, image paste/read/resize paths, image-generation APIs, and the `@silvia-odwyer/photon-node` dependency. Text clipboard copy and terminal hyperlink/color capability detection remain supported.
- Removed Windows-specific runtime, packaging, binary release, docs, and test support; pi now targets Linux and macOS.
- Removed all non-core providers from the built-in provider display names, default model map, model registry, provider attribution, env-key resolution, and CLI help text: Google Gemini, Google Vertex, xAI, Mistral, Amazon Bedrock, Groq, Cerebras, DeepSeek, NVIDIA NIM, Cloudflare (AI Gateway and Workers AI), OpenRouter, Vercel AI Gateway, ZAI (and ZAI Coding Plan China), Together AI, Fireworks, Kimi For Coding (Moonshot AI), Xiaomi MiMo (all regions), OpenCode Zen/Go, MiniMax, Hugging Face, GitHub Copilot, Azure OpenAI, and Ant Ling. Also removed `src/bun/register-bedrock.ts`, the `daxnuts` easter-egg component, and the `sdk-openrouter-attribution` test. The built-in providers are now Anthropic, OpenAI, and OpenAI Codex; custom OpenAI-compatible providers (e.g. Ollama Cloud) still work via `openai-completions` (see `docs/models.md` and `docs/custom-provider.md`).
- Removed the `thinkingBudgets` setting and `SettingsManager.getThinkingBudgets()`.
- Removed the `forceAdaptiveThinking` and `supportsEagerToolInputStreaming` Anthropic compat flags from the model registry schema; Anthropic models now always use adaptive thinking and per-tool `eager_input_streaming`.
- Removed the `/scoped-models`, `/clone`, `/arminsayshi`, and `/dementedelves` interactive slash commands, along with their dedicated components, keybindings, and tests.
- Removed the `/login` and `/logout` interactive slash commands; use `/account add` and `/account remove` instead.
- Ultragoal `complete` checkpoints now require a typed quality-gate object (`executorQa` with `artifactRefs` + `surfaceEvidence`, plus `contractCoverage`) instead of a free-form `{status}` object; free-form `{status}` quality gates are rejected, and any top-level key outside `{executorQa, contractCoverage}` is rejected as unsupported. Existing callers/tests must migrate to the typed row shape. Completion receipts now carry `receiptKind`, `planGeneration`, a 5-field `basis`, `qualityGateHash`, and `goalSnapshotHash` (Gajae-faithful model), replacing the prior 4-field receipt shape.
- Added a `ultragoal_guard` tool that returns a 9-state completion-receipt diagnostic (`inactive`, `unrelated_goal`, `active_verified_complete`, `active_missing_receipt`, `active_stale_receipt`, `active_missing_final_receipt`, `active_dirty_quality_gate`, `active_review_blocked_unrecorded`, `unreadable_fail_closed`).
- Removed install/update telemetry: the `enableInstallTelemetry` setting (and `SettingsManager.getEnableInstallTelemetry`/`setEnableInstallTelemetry`), the `PI_TELEMETRY` env var, the settings UI toggle, and the anonymous `pi.dev/api/report-install` ping. The `enableAnalytics` setting is unaffected.
- Removed the Pi version-update check: the startup "new version available" notice, the `PI_SKIP_VERSION_CHECK` env var, `src/utils/system/version-check.ts` (and its test), and the `pi pkg self-update` pre-check that compared against `pi.dev/api/latest-version`. `pi pkg self-update` now always proceeds unless it fails to install; package (extension) update notifications are unaffected.
- Removed the `github` and `report_finding` workflow harness tools (and the `github` tool test) from `extensions/workflow-tools.ts`. Agents can still run `gh` via the `bash` tool; subagents return results via `yield`.
- Removed `src/utils/system/html.ts` and HTML-entity decoding from `renderHighlightedHtml` in the syntax highlighter; highlight.js entities (`&amp;`, `&lt;`, etc.) are now passed through as-is.
- Removed the Termux documentation page (`docs/termux.md`) and its index/link references; Termux platform support code in the TUI, tool installer, and clipboard remains.
- Removed the `doom-overlay`, `snake`, `space-invaders`, `plan-mode`, `sandbox`, `custom-provider-anthropic`, and `custom-provider-gitlab-duo` example extensions (and the `plan-mode-utils` test), and dropped the `custom-provider-anthropic`, `custom-provider-gitlab-duo`, and `sandbox` workspace entries from the root manifest.

### Added

- Added default-on redacted API usage JSONL sidecar logging per completed LLM provider invocation, with `apiUsageLogging.enabled` opt-out.
- Added provider-style `.agent` / `.agents` discovery for trusted project and user skills, prompts, context/rule files, and system prompts.
- Added markdown/frontmatter agent definitions from `.agent/agents` and `.agents/agents`, bundled markdown-backed role agents, structured agent-profile diagnostics, and removed legacy JSON agent profile loading.
- Added session-scoped workflow state/artifact paths under `.pi/_session-{id}/`, plus session resolution utilities and tests for isolated Pi workflow runs.
- Added a ralplan pre-execution vagueness gate that redirects vague team/ultragoal dispatch prompts to planning unless explicitly forced.
- Added a default `lsp` tool with minimal TypeScript/JavaScript, Python, and Rust Language Server Protocol support for status, diagnostics, symbols, hover, definitions, and references.
- Added `pi --tmux` to launch interactive startup inside a new tmux session.
- Added stored account profiles for provider auth, with `/account add <provider> [account]`, an interactive `/account` selector, and `/account <provider> <account>` for manual switching.
- Added `/provider add` for creating custom OpenAI/Anthropic-compatible providers from interactive mode, plus `/account remove <provider> [account]` for deleting one or all stored provider accounts.
- Exported `CONFIG_DIR_NAME` from the coding-agent public API so extensions can resolve project config paths without hardcoding `.pi`.
- Added built-in Pi workflow commands, tools, and skills for deep-interview, ralplan, team, and ultragoal planning/execution flows.
- Added a Pi-native `SubagentManager` with durable session-owned records, spawn/await/resume/steer/pause/cancel, timeout-aware await, and an audit `index.jsonl`; exposed as `ctx.subagents` and via `subagent_spawn`, `subagent_status`, `subagent_await`, `subagent_resume`, `subagent_steer`, `subagent_pause`, and `subagent_cancel` tools. `ralplan_run_agent` now requires this manager for role-agent dispatch.
- Added cooperative `shouldPause` to the agent loop (`AgentOptions.shouldPause`) so subagent `pause()` stops at turn boundaries instead of aborting mid-prompt.
- Added `team_spawn_task_agent` and `ultragoal_spawn_goal_agent` tools that spawn subagent workers for team tasks and ultragoal goals.
- Added reusable agent profiles (`planner`, `architect`, `critic`, `worker`) with project/global JSON overrides for per-agent model, thinking level, tools, system prompt, and persistence defaults.
- Added `skipWorkflowContinuation` flag on `AgentSession`/`ExtensionContext` to prevent workflow continuation prompts from leaking into subagent sessions.
- Subagent sessions no longer receive a `SubagentManager` to prevent unbounded nesting; orchestration stays in the parent.
- Added live spawn, resume, pause, cancel, and await tests using the faux provider.
- **deep-interview**: Added a phase-boundary mutation guard that runtime-blocks the `edit` and `write` tools while a deep-interview workflow is active in a non-finished phase, always blocks direct `.pi/**` edits regardless of phase, and allows only system-temp scratch outside the project. Wired through the `tool_call` extension hook so it runs before tool execution.
- **deep-interview**: Added a `deep_interview_closure_check` tool that runs the closure/acceptance guard against current state and returns blocking gaps, making the pre-crystallization closure gate enforced rather than prose-only.
- **deep-interview**: Added an advisory `metadata` channel to `deep_interview_record_scoring` (auto-answer streak, refined rounds, ambiguity milestone, lateral/auto tallies, architect failures) and an optional `topology` field on `deep_interview_record_answer`, both merged safely via the deep-interview envelope merger so mid-interview state updates never clobber `rounds`. `deep_interview_read_compact` now surfaces `auto_answer_streak`, `ambiguity_milestone`, and advisory counter totals.
- **deep-interview**: Extended the scoring `metadata` channel to also carry `established_facts`, `ontology_snapshots`, and `topology` (full-list replacements), closing the gap between the documented methodology and the runtime: the closure guard reads `established_facts` for coverage, the HUD reads per-component `topology` weakest-dimension/target chips, and the spec reports ontology convergence.
- **deep-interview**: Added a `deep_interview_restate_goal` tool that wraps the previously dead `restateGoalGate`, enforcing the two-loop restate cap and persisting `restated_goal`/`closure_overrides` safely. Both Phase 4 gates (closure check and restate goal) are now enforced tools, not prose-only.
- **deep-interview**: Fixed the closure guard brownfield detection to use the init-state `type` field (with `codebase_context` fallback) instead of `initial_context_summary`, which is set for any oversized context regardless of greenfield/brownfield and could block closure for greenfield interviews with large pasted context.
- **deep-interview**: Substantially expanded the deep-interview skill with Gajae-inspired methodology: Use/Do-Not-Use guidance, execution policy (language preservation, silent self-proofread, weakest-dimension targeting), a Round 0 topology enumeration gate, bidirectional trigger scoring with established-facts maintenance, ontology extraction and stability tracking, a milestone-triggered lateral-review panel via read-only subagents, optional auto-research/auto-answer modes with a 0.85 clarity cap and dialectic rhythm guard, a closure guard and one-sentence restate gate, a prompt-budget summarization gate, a refine free-text gate, the full spec shape, examples, escalation rules, and a final checklist.
- Added `verbosity` parameter to `subagent_status` and `subagent_await` tools for receipt/preview/full output truncation.
- Team and ultragoal state-mutating tools now call `syncWorkflowHudUi` to keep the HUD in sync.
- Added `pi workflow gc --json [--prune] [--dry-run]`, a liveness-only GC sweep that reaps only confirmed-dead owner sessions (full session-dir removal via `removeSession`), keeps expired-but-alive/EPERM/malformed/no-pid leases (flagged, never removed), and is dry-run by default with `--prune` to delete. Built as an injectable `GcStoreAdapter` seam (`HarnessLeasesGcStoreAdapter`) with a single fail-closed `gcPidProbe` so future GC stores plug in later.
- Added a deferred-seam registry (`harness-runtime/seams.ts`) that fails closed with a named `seam_unsupported:<name>` token for designed-not-built harness extensions (tmux orchestration, git worktree isolation, `cross-harness-omx-fallback` [permanently blocked], remote transport, global daemon, capability-token auth), wired live into `recoverPrimitive`'s `fallback-harness-exec` branch.
- Added a receipt lifecycle-target consistency guard (`validateReceiptFamilyConsistency`) inside `mutateRuntimeSession` that rejects receipts whose post-state lifecycle contradicts their family target (finalize-accepted-but-not-completed, validate-passed-but-not-validating), throwing before any write so a contradiction leaves zero orphan events/receipts/state. Conservative and pluggable: blocked variants pass, pre-Phase-3 receipts are grandfathered (write-path only), and future receipt families register rules without touching the mutation path.
- Added a workflow manifest foundation and shared top-level workflow state validation for Pi workflow phases and operation-aware transitions.
- Hardened the ultragoal runtime into a safety-enforced execution ledger: Gajae-faithful completion receipts with `planGeneration` over a 5-field basis plus `qualityGateHash`/`goalSnapshotHash` content hashes and a `goal.updatedAt !== receipt.verifiedAt` drift check; stale-receipt detection via `validateCompletionReceipt`; typed quality-gate row validation (`validateExecutorQaEvidence`, hard break); structural artifact validation (PNG/JPEG screenshot dimensions + non-uniformity, automation-transcript JSON schema, PTY control sequences) in `ultragoal-artifacts.ts`; a 9-state `ultragoal_guard` diagnostic; and checkpoint-time enforcement in `checkpointUltragoalGoal` that refuses stale/invalid `complete` receipts at the write boundary. New modules: `shared/canonical-json.ts`, `ultragoal/ultragoal-receipt.ts`, `ultragoal/ultragoal-artifacts.ts`, `ultragoal/ultragoal-quality-gate.ts`, `ultragoal/ultragoal-guard.ts`. The ledger `goal_checkpointed` event now carries additive `qualityGateJson` + `goalJson` for receipt re-validation. Portability: `node:fs/promises` + `node:zlib` only (no `Bun.*`). Acyclic module graph (`runtime -> receipt + quality-gate`; `guard -> receipt + runtime`).
- Added a Gajae-faithful state-integrity core for workflow mode-state: tamper detection (`detectWorkflowEnvelopeIntegrityMismatch`) that hard-blocks unforced out-of-band edits and appends an `out_of_band_detected` audit entry (internal `force` bypass re-stamps + audits `force_overwrite`); a foundational session-owned audit log at `.pi/{sessionId}/state/audit.jsonl` with the Gajae-faithful `AuditEntry` schema covering every mode-state write/clear/handoff/reconcile plus `out_of_band_detected`, `invalid_transition_detected`, and `force_overwrite` (best-effort; never fails a sanctioned write); and a transaction-backed generic internal `handoffWorkflow` with a per-mutation journal under `.pi/{sessionId}/state/transactions/<id>.json` (D3 object-step shape + `version`/`mutation_id`/`created_at`/`updated_at`), both-side mode-state receipts sharing one `mutationId`, callee->caller->active-state write order, and an env-gated `PI_WORKFLOW_HANDOFF_FAIL_AFTER_CALLER` crash-injection contract that leaves a `pending` journal with partial steps (orphan repair deferred to STATE-007). New modules: `shared/audit-log.ts`, `shared/tamper-detection.ts`, `shared/transaction-journal.ts`, `shared/handoff.ts`. `state-writer.ts` exports `workflowEnvelopeContentSha256` as the single tamper-detection entry point. Force stays internal-only (no public CLI/tool verb).

### Changed

- Workflow runtime artifacts now require an owning session (type-level `string`, not `string | undefined`) and persist under the existing `.pi/{sessionId}/` layout, including workflow audit logs, transaction journals, subagent records, and ralplan role-agent records; session directory names remain unchanged; the global `.pi/` root is reserved for shared project config only, with no silent fallback.
- New session IDs now use a compact creation timestamp format (`YYYYMMDD-HHMMSS`), and session-scoped project artifacts now live directly under `.pi/{sessionId}/` instead of `.pi/_session-{sessionId}/`.
- Workflow runtime reads/writes now use explicit session ids from CLI/tool context for isolated state while retaining legacy global `.pi/` behavior for existing internal callers.
- Workflow handoffs (`executeDeepInterviewWriteSpec`, `approveRalplanPlan`) now go through a single generic internal `handoffWorkflow` with callee->caller->active-state write order, both-side mode-state receipts (`handoff-send`/`handoff-receive`), and a transaction journal. The caller mode-state is now demoted to `active:false, current_phase:"handoff"` (Gajae parity; previously deep-interview stayed `active:true` after handoff). `executeDeepInterviewWriteSpec` follows Gajae's two-step model: `finalizeDeepInterviewSpecState` persists the caller state with spec fields (`active:true`, `current_phase:"handoff"`, a regular write), then `handoffWorkflow` demotes it and promotes the callee; the `stop`/no-handoff branch is unchanged. Audit verbs map operations to the Gajae-faithful set (`handoff-send`/`handoff-receive`->`handoff`; `force-repair`->`reconcile`; others->`write`/`clear`).
- Enabled tmux extended keys in the default `pi --tmux` profile.
- Simplified shell, clipboard, tool download, signal handling, self-update, and release code paths for Linux/macOS-only support.
- Stopped publishing coding-agent docs and examples in the npm package.
- Updated extension docs, examples, runtime help, trust prompts, and config labels to use the configured project config directory instead of hardcoded `.pi` paths.

### Fixed

- Fixed `/model` autocomplete and model selection searches to match provider/model queries regardless of whether the provider or model token is typed first.
- Fixed the tree navigator to horizontally pan deep entries so the selected item remains readable ([#5830](https://github.com/tsuuanmi/pi/issues/5830)).

### Removed

- Removed repo-local `.pi` prompt templates, extensions, and skills.

## [0.79.6] - 2026-06-16

### Fixed

- Fixed HTTP dispatcher configuration to preserve a caller's deliberate `fetch` override instead of reinstalling the undici global fetch over it.
- Fixed inherited OpenCode Go DeepSeek V4 thinking-off requests to send the provider's `thinking: { type: "disabled" }` compatibility parameter.

## [0.79.5] - 2026-06-16

### New Features

- **Provider-scoped API key environments** - `auth.json` API key entries can now include `env` overrides for provider-specific Cloudflare, Azure OpenAI, Google Vertex, Amazon Bedrock, cache retention, and proxy settings without changing the project shell. See [Auth File](docs/providers.md#auth-file).
- **Global HTTP proxy setting** - Configure `httpProxy` once in global settings to apply `HTTP_PROXY` and `HTTPS_PROXY` to Pi-managed HTTP clients. See [Network](docs/settings.md#network).
- **Vercel AI Gateway attribution** - Vercel AI Gateway requests now include Pi attribution headers by default. See [API Keys](docs/providers.md#api-keys).

### Added

- Added Vercel AI Gateway request attribution headers (`http-referer` and `x-title`) for Vercel AI Gateway models ([#5798](https://github.com/tsuuanmi/pi/pull/5798) by [@rwachtler](https://github.com/rwachtler)).
- Added an `xp` footer marker when experimental features are enabled.
- Added a global `httpProxy` setting that applies as `HTTP_PROXY` and `HTTPS_PROXY` for Pi-managed HTTP clients ([#5790](https://github.com/tsuuanmi/pi/issues/5790)).
- Added `auth.json` API key `env` values so provider-specific environment overrides can be scoped to Pi and propagated to inherited provider configuration ([#5728](https://github.com/tsuuanmi/pi/issues/5728)).

### Changed

- Updated the vendored Markdown parser used by HTML session exports to `marked` 18.0.5.

### Fixed

- Fixed inherited OpenAI Responses streaming to tolerate null message content from OpenAI-compatible servers before tool calls ([#5819](https://github.com/tsuuanmi/pi/issues/5819)).
- Fixed inherited OpenCode DeepSeek V4 thinking requests to avoid sending both `thinking` and `reasoning_effort` ([#5818](https://github.com/tsuuanmi/pi/issues/5818)).
- Fixed device-code login to stop opening the browser automatically.
- Fixed inherited editor Cursor Up handling so non-empty drafts jump to the start of the line before browsing input history ([#5789](https://github.com/tsuuanmi/pi/pull/5789) by [@4h9fbZ](https://github.com/4h9fbZ)).
- Fixed inherited Z.AI GLM-5.2 thinking requests to send `reasoning_effort` with the provider's `high`/`max` effort mapping ([#5770](https://github.com/tsuuanmi/pi/issues/5770)).
- Fixed successful `pi update` on Windows to exit naturally instead of calling `process.exit(0)`, avoiding a Node.js/libuv assertion after version-check network requests ([#5805](https://github.com/tsuuanmi/pi/issues/5805)).
- Fixed inherited Google and `google-vertex` Gemini model metadata to map `latest` aliases to the current models, add Gemini 3.5 Flash for Vertex, correct Gemini 2.5 Flash Vertex cache pricing, and remove shut-down Vertex preview models ([#5761](https://github.com/tsuuanmi/pi/issues/5761)).
- Fixed the session selector to stay open and show the all-sessions empty state when both current-folder and all-scope session lists are empty ([#5747](https://github.com/tsuuanmi/pi/issues/5747)).
- Fixed inherited Moonshot AI China model metadata to include Kimi K2.7 Code, and omitted unsupported thinking-off payloads for Kimi K2.7 Code models ([#5760](https://github.com/tsuuanmi/pi/issues/5760)).
