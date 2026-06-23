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

### Added

- Added session-scoped workflow state/artifact paths under `.pi/_session-{id}/`, plus session resolution utilities and tests for isolated Pi workflow runs.
- Added a ralplan pre-execution vagueness gate that redirects vague team/ultragoal dispatch prompts to planning unless explicitly forced.
- Added a default `lsp` tool with minimal TypeScript/JavaScript, Python, and Rust Language Server Protocol support for status, diagnostics, symbols, hover, definitions, and references.
- Added `pi --tmux` to launch interactive startup inside a new tmux session.
- Added stored account profiles for provider auth, with `/account add <provider> [account]`, an interactive `/account` selector, and `/account <provider> <account>` for manual switching.
- Added `/provider add` for creating custom OpenAI/Anthropic-compatible providers from interactive mode, plus `/account remove <provider> [account]` for deleting one or all stored provider accounts.
- Exported `CONFIG_DIR_NAME` from the coding-agent public API so extensions can resolve project config paths without hardcoding `.pi`.
- Added built-in Pi workflow commands, tools, and skills for deep-interview, ralplan, team, and ultragoal planning/execution flows.
- Added a Pi-native `SubagentManager` with durable records under `.pi/workflows/subagents/`, spawn/await/resume/steer/pause/cancel, timeout-aware await, and an audit `index.jsonl`; exposed as `ctx.subagents` and via `subagent_spawn`, `subagent_status`, `subagent_await`, `subagent_resume`, `subagent_steer`, `subagent_pause`, and `subagent_cancel` tools. `ralplan_run_agent` now requires this manager for role-agent dispatch.
- Added cooperative `shouldPause` to the agent loop (`AgentOptions.shouldPause`) so subagent `pause()` stops at turn boundaries instead of aborting mid-prompt.
- Added `team_spawn_task_agent` and `ultragoal_spawn_goal_agent` tools that spawn subagent workers for team tasks and ultragoal goals.
- Added reusable agent profiles (`planner`, `architect`, `critic`, `worker`) with project/global JSON overrides for per-agent model, thinking level, tools, system prompt, and persistence defaults.
- Added `skipWorkflowContinuation` flag on `AgentSession`/`ExtensionContext` to prevent workflow continuation prompts from leaking into subagent sessions.
- Subagent sessions no longer receive a `SubagentManager` to prevent unbounded nesting; orchestration stays in the parent.
- Added live spawn, resume, pause, cancel, and await tests using the faux provider.
- Added `verbosity` parameter to `subagent_status` and `subagent_await` tools for receipt/preview/full output truncation.
- Team and ultragoal state-mutating tools now call `syncWorkflowHudUi` to keep the HUD in sync.
- Added `pi workflow gc --json [--prune] [--dry-run]`, a liveness-only GC sweep that reaps only confirmed-dead owner sessions (full session-dir removal via `removeSession`), keeps expired-but-alive/EPERM/malformed/no-pid leases (flagged, never removed), and is dry-run by default with `--prune` to delete. Built as an injectable `GcStoreAdapter` seam (`HarnessLeasesGcStoreAdapter`) with a single fail-closed `gcPidProbe` so future GC stores plug in later.
- Added a deferred-seam registry (`harness-runtime/seams.ts`) that fails closed with a named `seam_unsupported:<name>` token for designed-not-built harness extensions (tmux orchestration, git worktree isolation, `cross-harness-omx-fallback` [permanently blocked], remote transport, global daemon, capability-token auth), wired live into `recoverPrimitive`'s `fallback-harness-exec` branch.
- Added a receipt lifecycle-target consistency guard (`validateReceiptFamilyConsistency`) inside `mutateRuntimeSession` that rejects receipts whose post-state lifecycle contradicts their family target (finalize-accepted-but-not-completed, validate-passed-but-not-validating), throwing before any write so a contradiction leaves zero orphan events/receipts/state. Conservative and pluggable: blocked variants pass, pre-Phase-3 receipts are grandfathered (write-path only), and future receipt families register rules without touching the mutation path.
- Added a workflow manifest foundation and shared top-level workflow state validation for Pi workflow phases and operation-aware transitions.
- Hardened the ultragoal runtime into a safety-enforced execution ledger: Gajae-faithful completion receipts with `planGeneration` over a 5-field basis plus `qualityGateHash`/`goalSnapshotHash` content hashes and a `goal.updatedAt !== receipt.verifiedAt` drift check; stale-receipt detection via `validateCompletionReceipt`; typed quality-gate row validation (`validateExecutorQaEvidence`, hard break); structural artifact validation (PNG/JPEG screenshot dimensions + non-uniformity, automation-transcript JSON schema, PTY control sequences) in `ultragoal-artifacts.ts`; a 9-state `ultragoal_guard` diagnostic; and checkpoint-time enforcement in `checkpointUltragoalGoal` that refuses stale/invalid `complete` receipts at the write boundary. New modules: `shared/canonical-json.ts`, `ultragoal/ultragoal-receipt.ts`, `ultragoal/ultragoal-artifacts.ts`, `ultragoal/ultragoal-quality-gate.ts`, `ultragoal/ultragoal-guard.ts`. The ledger `goal_checkpointed` event now carries additive `qualityGateJson` + `goalJson` for receipt re-validation. Portability: `node:fs/promises` + `node:zlib` only (no `Bun.*`). Acyclic module graph (`runtime -> receipt + quality-gate`; `guard -> receipt + runtime`).
- Added a Gajae-faithful state-integrity core for workflow mode-state: tamper detection (`detectWorkflowEnvelopeIntegrityMismatch`) that hard-blocks unforced out-of-band edits and appends an `out_of_band_detected` audit entry (internal `force` bypass re-stamps + audits `force_overwrite`); a foundational audit log at `.pi/state/audit.jsonl` with the Gajae-faithful `AuditEntry` schema covering every mode-state write/clear/handoff/reconcile plus `out_of_band_detected`, `invalid_transition_detected`, and `force_overwrite` (best-effort; never fails a sanctioned write); and a transaction-backed generic internal `handoffWorkflow` with a per-mutation journal under `.pi/state/transactions/<id>.json` (D3 object-step shape + `version`/`mutation_id`/`created_at`/`updated_at`), both-side mode-state receipts sharing one `mutationId`, callee->caller->active-state write order, and an env-gated `PI_WORKFLOW_HANDOFF_FAIL_AFTER_CALLER` crash-injection contract that leaves a `pending` journal with partial steps (orphan repair deferred to STATE-007). New modules: `shared/audit-log.ts`, `shared/tamper-detection.ts`, `shared/transaction-journal.ts`, `shared/handoff.ts`. `state-writer.ts` exports `workflowEnvelopeContentSha256` as the single tamper-detection entry point. Force stays internal-only (no public CLI/tool verb).

### Changed

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

## [0.79.4] - 2026-06-15

### New Features

- **Automatic first-run theme selection** - pi detects the terminal background on first run and defaults to the `dark` or `light` theme. See [Selecting a Theme](docs/themes.md#selecting-a-theme).
- **Standalone binary integrity checksums** - GitHub release assets now include `SHA256SUMS` files for verifying standalone binary downloads. See [Quickstart Install](docs/quickstart.md#install).

### Added

- Added `SHA256SUMS` integrity files to standalone binary GitHub release assets ([#5739](https://github.com/tsuuanmi/pi/issues/5739)).
- Added first-run interactive theme detection from the terminal background ([#5385](https://github.com/tsuuanmi/pi/pull/5385) by [@vegarsti](https://github.com/vegarsti)).

### Fixed

- Fixed bash tool output collection to keep draining stdout/stderr after the child exits while descendants still write, avoiding truncated late output ([#5753](https://github.com/tsuuanmi/pi/pull/5753) by [@Mearman](https://github.com/Mearman)).
- Fixed `/tree` help rendering to show compact wrapped controls instead of truncating them on narrow terminals ([#5055](https://github.com/tsuuanmi/pi/issues/5055)).
- Fixed SIGTERM/SIGHUP interactive shutdown to keep signal handlers installed until terminal cleanup completes, preventing `signal-exit` from re-sending the signal and leaving the terminal in raw/Kitty keyboard mode ([#5724](https://github.com/tsuuanmi/pi/issues/5724)).
- Fixed extensions documentation to clarify that `pi.getActiveTools()` returns active tool names while `pi.getAllTools()` returns tool metadata ([#5729](https://github.com/tsuuanmi/pi/issues/5729)).
- Fixed question and questionnaire extension examples to wrap long prompt, option, and help text instead of truncating it ([#5708](https://github.com/tsuuanmi/pi/pull/5708) by [@xl0](https://github.com/xl0)).
- Fixed package commands such as `pi list`, `pi install`, and `pi update` to terminate after completing even if an extension leaves background handles open ([#5687](https://github.com/tsuuanmi/pi/issues/5687)).
- Fixed `pi update` for pnpm global installs whose configured `global-bin-dir` no longer matches the active pnpm home ([#5689](https://github.com/tsuuanmi/pi/issues/5689)).
- Fixed npm package specs that use ranges or tags (for example `@^1.2.7`) so installed package resources still load instead of being treated as mismatched exact pins ([#5695](https://github.com/tsuuanmi/pi/issues/5695)).
- Fixed inherited Anthropic 1-hour prompt-cache write cost accounting to price 1-hour cache writes at 2x input instead of the 5-minute cache-write rate ([#5738](https://github.com/tsuuanmi/pi/pull/5738) by [@theBucky](https://github.com/theBucky)).
- Fixed inherited GitHub Copilot Claude adaptive-thinking effort metadata to match manually checked Copilot model capabilities ([#4637](https://github.com/tsuuanmi/pi/issues/4637)).
- Fixed inherited OpenCode/OpenCode Go completion model metadata to omit long-retention cache fields for routes that reject `prompt_cache_retention` ([#5702](https://github.com/tsuuanmi/pi/issues/5702)).
- Fixed inherited overlay compositing over CJK wide characters so borders stay aligned when an overlay starts inside a full-width cell ([#5297](https://github.com/tsuuanmi/pi/issues/5297)).
- Fixed inherited WezTerm inline Kitty image rendering during full redraw fallbacks so image padding rows are reserved before the placement is drawn without regressing tall-image placement ([#5618](https://github.com/tsuuanmi/pi/issues/5618), [#4415](https://github.com/tsuuanmi/pi/issues/4415)).
- Fixed custom provider config so plain uppercase API key and header values remain literals instead of being treated as legacy environment references; use explicit `$ENV_VAR` syntax for environment variables ([#5661](https://github.com/tsuuanmi/pi/issues/5661)).

## [0.79.3] - 2026-06-13

### Fixed

- Fixed inherited OpenAI GPT-5.4/GPT-5.5 and OpenAI Codex GPT-5.4/GPT-5.4 mini/GPT-5.5 context window metadata to use the observed 272k-token Codex backend limit, avoiding a billing hazard from prompts above Codex's accepted limit (reported by [@trethore](https://github.com/trethore)).

## [0.79.2] - 2026-06-12

### New Features

- **Clearer Bedrock validation guidance** - Amazon Bedrock data retention validation errors now link to AWS data retention documentation. See [Amazon Bedrock](docs/providers.md#amazon-bedrock).

### Added

- Added an experimental first-time setup flow behind `PI_EXPERIMENTAL=1` that asks for a dark/light theme choice (preselecting the detected appearance) and opt-in analytics data sharing on first launch with the default agent directory; opting in stores a `trackingId` in `settings.json` ([#5587](https://github.com/tsuuanmi/pi/pull/5587) by [@vegarsti](https://github.com/vegarsti)).
- Added AWS data retention documentation links to inherited Amazon Bedrock unsupported data retention mode validation errors ([#5561](https://github.com/tsuuanmi/pi/pull/5561) by [@unexge](https://github.com/unexge)).

### Fixed

- Fixed project trust detection to ignore global `~/.pi/agent` state when running from `$HOME`, and made `pi update` use only saved or explicit project trust without prompting ([#5619](https://github.com/tsuuanmi/pi/issues/5619)).
- Fixed experimental first-time setup to skip forked sessions instead of rerunning the setup prompts ([#5627](https://github.com/tsuuanmi/pi/pull/5627) by [@vegarsti](https://github.com/vegarsti)).
- Fixed inherited OpenAI-compatible context overflow detection for parenthesized `maximum context length (N)` errors ([#5677](https://github.com/tsuuanmi/pi/issues/5677)).
- Fixed inherited OpenAI GPT-5.4/GPT-5.5 and OpenAI Codex GPT-5.4/GPT-5.4 mini/GPT-5.5 context window metadata to match current OpenAI limits ([#5644](https://github.com/tsuuanmi/pi/issues/5644)).
- Fixed inherited Anthropic refusal stops to preserve provider `stop_details` explanations in error messages ([#5666](https://github.com/tsuuanmi/pi/pull/5666) by [@rwachtler](https://github.com/rwachtler)).
- Increased the inherited OpenAI Codex Responses SSE response-header timeout to 20 seconds to reduce false-positive stalls while retaining the bounded wait introduced for zero-event hangs ([#4945](https://github.com/tsuuanmi/pi/issues/4945)).
- Fixed inherited Claude Fable 5 thinking-off requests to omit Anthropic's unsupported `thinking.type: "disabled"` payload ([#5567](https://github.com/tsuuanmi/pi/pull/5567) by [@tmustier](https://github.com/tmustier)).
- Fixed inherited late tool progress callbacks after tool settlement to be ignored instead of emitting stale `tool_execution_update` events ([#5573](https://github.com/tsuuanmi/pi/issues/5573)).
- Fixed inherited user-message transcript rendering so standalone `+` messages no longer render as `-` ([#5657](https://github.com/tsuuanmi/pi/issues/5657)).
- Fixed inherited slash-separated fuzzy queries so provider/model completions remain matchable after insertion.
- Fixed inherited WezTerm inline Kitty image rendering so reserved row clears do not erase all but the top strip of tool image previews ([#5618](https://github.com/tsuuanmi/pi/issues/5618)).
- Fixed inherited editor wrapping for CJK text to break at character boundaries instead of leaving large trailing gaps ([#5585](https://github.com/tsuuanmi/pi/pull/5585) by [@haoqixu](https://github.com/haoqixu)).
- Fixed inherited loose Markdown list rendering to preserve blank-line separation between list items ([#5562](https://github.com/tsuuanmi/pi/pull/5562) by [@Perlence](https://github.com/Perlence)).
- Fixed `--model` resolution for authenticated custom model IDs whose slash prefix matches an unauthenticated built-in provider ([#5643](https://github.com/tsuuanmi/pi/issues/5643)).
- Fixed `/fork` to keep session parent chains connected when the forked path contains labels ([#5669](https://github.com/tsuuanmi/pi/issues/5669)).
- Fixed `/share` and `/export` HTML exports to use the active fallback theme when the configured custom theme no longer exists ([#5596](https://github.com/tsuuanmi/pi/issues/5596)).
- Fixed custom fallback model IDs with `:<thinking>` suffixes to preserve the requested thinking level when the provider template model does not advertise reasoning ([#5560](https://github.com/tsuuanmi/pi/pull/5560) by [@haoqixu](https://github.com/haoqixu)).

## [0.79.1] - 2026-06-09

### New Features

- **Claude Fable 5** - Claude Fable 5 is now available on the Anthropic and Amazon Bedrock providers, with adaptive thinking and `xhigh` effort support.
- **Prompt template defaults** - Prompt templates can use default positional arguments such as `${1:-7}` for optional values. See [Prompt Template Arguments](docs/prompt-templates.md#arguments).
- **Configurable project trust defaults** - `defaultProjectTrust` lets users choose whether unresolved project trust asks, always trusts, or never trusts by default, and extensions can inspect effective trust decisions. See [Project Trust](docs/security.md#project-trust) and [`ctx.isProjectTrusted()`](docs/extensions.md#ctxisprojecttrusted).
- **Natural extension autocomplete triggers** - Extension autocomplete providers can declare trigger characters such as `#` or `$` so suggestions open without slash-command prefixes. See [Autocomplete Providers](docs/extensions.md#autocomplete-providers).

### Added

- Added default-value expansion for prompt template positional arguments, e.g. `${1:-7}` ([#5553](https://github.com/tsuuanmi/pi/pull/5553) by [@dannote](https://github.com/dannote)).
- Added `areExperimentalFeaturesEnabled` feature guard to allow users to opt in to early features ([#5547](https://github.com/tsuuanmi/pi/pull/5547) by [@vegarsti](https://github.com/vegarsti)).
- Added `ctx.isProjectTrusted()` for extensions to observe the effective project trust decision, including temporary trust decisions ([#5523](https://github.com/tsuuanmi/pi/issues/5523)).
- Added a global `defaultProjectTrust` setting to choose whether unresolved project trust asks, always trusts, or never trusts by default.
- Added extension autocomplete trigger character support for `ctx.ui.addAutocompleteProvider()` wrappers ([#4703](https://github.com/tsuuanmi/pi/issues/4703)).
- Added Claude Fable 5 model support inherited from `@tsuuanmi/pi-ai` for the Anthropic and Amazon Bedrock providers, with adaptive thinking and `xhigh` effort support.

### Fixed

- Fixed inherited Amazon Bedrock inference profile ARN region resolution to prefer the ARN's embedded region over `AWS_REGION` ([#5527](https://github.com/tsuuanmi/pi/pull/5527) by [@AJM10565](https://github.com/AJM10565)).
- Fixed inherited IME hardware cursor positioning while slash-command autocomplete is visible ([#5283](https://github.com/tsuuanmi/pi/pull/5283) by [@smoosex](https://github.com/smoosex)).
- Fixed inherited z.ai thinking-off requests to send the provider's `thinking: { type: "disabled" }` compatibility parameter ([#5330](https://github.com/tsuuanmi/pi/issues/5330)).
- Fixed inherited OpenCode completions model metadata to send explicit `maxTokens` as `max_tokens` ([#5331](https://github.com/tsuuanmi/pi/issues/5331)).
- Fixed inherited Moonshot Kimi thinking-off requests to send the provider's `thinking: { type: "disabled" }` compatibility parameter ([#5531](https://github.com/tsuuanmi/pi/issues/5531)).
- Fixed inherited Azure OpenAI Responses requests to disable server-side response storage ([#5530](https://github.com/tsuuanmi/pi/issues/5530)).
- Fixed inherited Azure GPT-5.4 and GPT-5.5 context window metadata to 1,050,000 tokens, matching Azure Foundry deployments instead of OpenAI's 272k limit ([#5559](https://github.com/tsuuanmi/pi/issues/5559)).
- Fixed inherited OpenAI and Azure GPT-5 Pro `maxTokens` metadata to 128,000, correcting an upstream value that duplicated the input sub-limit as the output limit ([#5559](https://github.com/tsuuanmi/pi/issues/5559)).
- Fixed inherited prompt history navigation to restore the current draft when returning from history browsing ([#5494](https://github.com/tsuuanmi/pi/issues/5494)).
- Fixed inherited wrapping for mixed Latin and CJK text so unspaced CJK runs can break at grapheme boundaries without leaving large trailing gaps ([#5495](https://github.com/tsuuanmi/pi/issues/5495)).
- Fixed extension OAuth login prompts to keep previous submitted prompt rows stable instead of mirroring the active input value ([#5433](https://github.com/tsuuanmi/pi/issues/5433)).
- Fixed `/reload` to apply updated `steeringMode` and `followUpMode` settings to the current session ([#5377](https://github.com/tsuuanmi/pi/issues/5377)).
- Fixed invalid `models.json` syntax to skip startup config migrations and report the normal file-path-aware models error instead of a raw JSON parse stack trace ([#5418](https://github.com/tsuuanmi/pi/issues/5418)).
- Fixed GitHub release notes and interactive changelog links to resolve package-relative documentation URLs correctly ([#5516](https://github.com/tsuuanmi/pi/issues/5516)).
- Fixed CLI help and version output, including plain redirected `--help`/`--version` output and simplified `list`/`config` help text.
- Fixed `/new` from ephemeral sessions to keep the new session ephemeral instead of persisting it by default ([#5045](https://github.com/tsuuanmi/pi/issues/5045)).
- Clarified custom model docs that `name` and `modelOverrides.name` do not replace model IDs in the footer or primary model lists ([#4841](https://github.com/tsuuanmi/pi/issues/4841)).

## [0.79.0] - 2026-06-08

### New Features

- **Project trust for local inputs** - Pi now asks before loading project-local settings, resources, instructions, and packages, with saved decisions and `--approve` / `--no-approve` controls for non-interactive modes. See [Project Trust](README.md#project-trust).
- **Extension-controlled trust decisions** - Global and CLI extensions can handle `project_trust`, decide, remember, or defer project trust before project-local resources load. See [`project_trust`](docs/extensions.md#project_trust).
- **Cache-hit visibility in the footer** - The interactive footer now shows the latest prompt cache hit rate (`CH`). See [Interactive Mode](README.md#interactive-mode).
- **Richer SDK and RPC extension surfaces** - Public exports now include RPC extension UI request/response types and package asset path helpers. See [Extension UI Protocol](docs/rpc.md#extension-ui-protocol) and [SDK Exports](docs/sdk.md#exports).

### Added

- Added a `project_trust` extension event so global and CLI extensions can decide or defer project trust during startup and runtime cwd switches.
- Added project trust gating for project-local settings, resources, instructions, and packages ([#5332](https://github.com/tsuuanmi/pi/pull/5332)).
- Added the latest prompt cache hit rate to the interactive footer.
- Exported RPC extension UI request and response types from the public API ([#5455](https://github.com/tsuuanmi/pi/issues/5455)).
- Exported coding-agent package asset path helpers from the public API ([#5415](https://github.com/tsuuanmi/pi/issues/5415)).

### Fixed

- Fixed package exports by removing the stale `./hooks` subpath that pointed at non-existent build output.
- Fixed inherited TUI rendering to clear stale lines when content shrinks to zero.
- Fixed inherited autocomplete suggestions to refresh after editor cursor movement ([#5499](https://github.com/tsuuanmi/pi/pull/5499) by [@Roman-Galeev](https://github.com/Roman-Galeev)).
- Fixed `/reload` to persist project trust when an implicitly trusted session creates a project `.pi` directory.
- Fixed project trust input discovery to traverse parent directories portably.
- Fixed inherited intermittent Shift+Enter handling by making Kitty keyboard protocol fallback response-driven instead of timeout-driven ([#5188](https://github.com/tsuuanmi/pi/issues/5188)).
- Fixed the compaction summarization system prompt to use neutral AI assistant wording for non-coding agents ([#5401](https://github.com/tsuuanmi/pi/issues/5401)).
- Fixed `models.json` schema support and inherited OpenAI Responses custom-provider handling for `compat.supportsDeveloperRole: false` ([#5456](https://github.com/tsuuanmi/pi/issues/5456)).
- Fixed inherited prompt history navigation to place the cursor at the start when browsing upward and at the end when browsing downward ([#5454](https://github.com/tsuuanmi/pi/issues/5454)).
- Fixed tmux setup documentation to require tmux 3.5 for `extended-keys-format csi-u` and document the tmux 3.2-3.4 fallback ([#5432](https://github.com/tsuuanmi/pi/issues/5432)).
- Fixed inherited OpenRouter routing preferences on OpenAI-compatible custom providers to work when the custom provider base URL does not point directly at OpenRouter ([#5347](https://github.com/tsuuanmi/pi/issues/5347)).
- Fixed built-in tool expand hints to style closing parentheses consistently ([#5359](https://github.com/tsuuanmi/pi/issues/5359)).
- Fixed skill-wrapped prompts to insert spacing between skill instructions and the user message ([#5371](https://github.com/tsuuanmi/pi/pull/5371) by [@Perlence](https://github.com/Perlence)).

## [0.78.1] - 2026-06-04

### New Features

- **More built-in provider coverage** - Added Ant Ling and NVIDIA NIM provider setup, plus MiniMax-M3 support for the direct MiniMax providers. See [Providers](docs/providers.md).
- **Richer extension context** - Extensions can use `ctx.mode` and `ctx.getSystemPromptOptions()` to adapt behavior across TUI, RPC, JSON, and print modes and inspect base system prompt inputs. See [Extensions](docs/extensions.md).

### Added

- Added containerization documentation for sandboxing pi with Docker or OpenShell.
- Added Ant Ling provider selection and setup documentation.
- Added MiniMax-M3 model support inherited from `@tsuuanmi/pi-ai` for the `minimax` and `minimax-cn` direct providers ([#5313](https://github.com/tsuuanmi/pi/issues/5313)).
- Added NVIDIA NIM provider selection, setup documentation, and direct NIM request attribution headers.
- Added `ctx.mode` to extension contexts so extensions can distinguish TUI, RPC, JSON, and print mode.
- Added `ctx.getSystemPromptOptions()` for extension commands to inspect the current base system prompt inputs ([#5306](https://github.com/tsuuanmi/pi/pull/5306) by [@xl0](https://github.com/xl0)).

### Fixed

- Fixed temporary extension package installs to use a private `~/.pi/agent/tmp/extensions` directory with `0700` permissions instead of `os.tmpdir()/pi-extensions`.
- Fixed git package source handling to reject unsafe host/path components and keep managed clone paths inside install roots.
- Fixed stored XSS in HTML session exports by sanitizing Markdown link and image URLs with a scheme allow-list after stripping control characters.
- Fixed SDK embedding in bundled Node apps failing with `ENOENT` when `package.json` is not present next to the bundle entrypoint. The package metadata reader now gracefully handles missing `package.json` by using defaults, enabling `createAgentSession()` without requiring package-adjacent files at runtime ([#5226](https://github.com/tsuuanmi/pi/issues/5226)).
- Fixed HTTP timeout setting not being respected for non-Codex providers (e.g., llama.cpp via OpenAI-compatible API). The `httpIdleTimeoutMs` setting (set via `/settings` HTTP timeout) now applies as the default SDK request timeout for all providers that support it, not just OpenAI Codex Responses. Disabling the timeout (HTTP timeout = false) now correctly disables SDK timeouts for all supported providers by sending a maximum int32 value (effectively infinite) instead of 0, since SDKs treat timeout=0 as an immediate timeout ([#5294](https://github.com/tsuuanmi/pi/issues/5294)).
- Fixed inherited Amazon Bedrock requests to replace blank required user/tool-result text with a placeholder and skip blank replay text blocks ([#4975](https://github.com/tsuuanmi/pi/issues/4975)).
- Fixed inherited Anthropic Claude Opus 4.7+ requests to suppress deprecated temperature parameters ([#5251](https://github.com/tsuuanmi/pi/pull/5251) by [@yzhg1983](https://github.com/yzhg1983)).
- Fixed inherited OpenAI GPT-5.5 generated metadata to omit unsupported minimal thinking ([#5243](https://github.com/tsuuanmi/pi/issues/5243)).
- Fixed inherited OpenRouter Kimi K2.6 thinking replay and developer-role instruction handling ([#5309](https://github.com/tsuuanmi/pi/issues/5309)).
- Fixed inherited OpenRouter reasoning instruction requests to preserve the system role when required ([#5221](https://github.com/tsuuanmi/pi/pull/5221) by [@PriNova](https://github.com/PriNova)).
- Fixed inherited overlay focus restoration so non-capturing overlays remain interactive after UI rerenders and explicit focus release ([#5235](https://github.com/tsuuanmi/pi/pull/5235) by [@nicobailon](https://github.com/nicobailon)).
- Fixed inherited tab width accounting in column slicing and overlay compositing so tab-containing output cannot exceed the terminal width ([#5218](https://github.com/tsuuanmi/pi/issues/5218)).
- Fixed opening and listing very large JSONL session files by reading session entries line-by-line instead of materializing the full file as one string ([#5231](https://github.com/tsuuanmi/pi/issues/5231)).
- Fixed the footer branch display in WSL `/mnt/...` repositories to refresh after branch changes ([#5264](https://github.com/tsuuanmi/pi/pull/5264) by [@psoukie](https://github.com/psoukie)).
- Fixed `renderShell: "self"` tool renderers that emit no component lines leaving a blank chat row ([#5299](https://github.com/tsuuanmi/pi/issues/5299)).
- Restored inherited NVIDIA Qwen 3.5 122B NIM model support.
