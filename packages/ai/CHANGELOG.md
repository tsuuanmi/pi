## [0.2.0] - 2026-07-20

### Breaking Changes

- Removed the non-core providers and their built-in model catalogs, env-key resolution, OAuth flows, provider modules, image-generation providers, and image-generation API surface: Mistral, Amazon Bedrock, Groq, Cerebras, DeepSeek, NVIDIA NIM, Cloudflare (AI Gateway and Workers AI), OpenRouter, Vercel AI Gateway, ZAI (and ZAI Coding Plan China), Together AI, Fireworks, Kimi For Coding (Moonshot AI), Xiaomi MiMo (all regions), OpenCode Zen/Go, MiniMax, Hugging Face, GitHub Copilot, Azure OpenAI, Ant Ling, Google Generative AI (`google-generative-ai`), and xAI. The library now ships built-in chat support for `anthropic-messages`, `openai-responses`, `openai-codex-responses`, and `openai-completions` (generic OpenAI-compatible).
- Removed legacy Anthropic budget-based thinking (`thinking.type: "enabled"` / `thinkingBudgetTokens`), the `fine-grained-tool-streaming-2025-05-14` and `interleaved-thinking-2025-05-14` beta headers, the `forceAdaptiveThinking` and `supportsEagerToolInputStreaming` compat flags, and `ThinkingBudgets` / `SimpleStreamOptions.thinkingBudgets`. Reasoning Anthropic models now always use adaptive thinking and per-tool `eager_input_streaming`.
- Removed legacy plain-string `textSignature` parsing in the OpenAI Responses provider; only `TextSignatureV1` JSON signatures are replayed.
- Removed third-party overflow detection patterns (Google, xAI, llama.cpp, LM Studio, Ollama, generic fallbacks); only Anthropic and OpenAI patterns remain.
- Removed the standalone `pi-ai` CLI binary (the `bin.pi-ai` entry and `src/cli.ts`); the `@tsuuanmi/pi-ai` library and its `./oauth` subpath are unaffected. Use the `pi` CLI or the programmatic `@tsuuanmi/pi-ai/oauth` entry point instead.

### Removed

- Removed the `@google/genai` dependency and the `./google` package export, plus `GoogleOptions`, `GoogleThinkingLevel`, `streamGoogle`/`streamSimpleGoogle`, and Google/xAI models from the generated model catalog.

### Added

- Added a public TypeBox validation-path formatter for provider integrations.
- Added OpenAI Codex quota usage helpers for provider integrations.
- Added Ollama Cloud model generation from `models.dev`, with `OLLAMA_API_KEY` credential lookup.
- Added GLM-5.2 model to the OpenCode Go subscription model catalog ([#5860](https://github.com/tsuuanmi/pi/issues/5860)).
- Added the `supportsPromptCacheKey` compat flag (default `true`) to `openai-completions` providers, enabling the `prompt_cache_key` field for prompt caching on every OpenAI-compatible provider by default. Set `false` per-provider to opt out (e.g. for a provider that rejects the field).

### Changed

- Reorganized the internal source layout to remove the generic `src/core` folder and colocate small helpers with their owning modules.
- Consolidated provider tests into provider-level test files and removed overly specific credential-dependent smoke/cache-affinity cases.
- Generalized the OAuth device-code timeout hint to refer to VM clock drift instead of WSL.
- `openai-completions` now emits `prompt_cache_key` for all providers when cache retention is not `none` (previously only for `api.openai.com` base URLs or long-retention compat). Use `compat.supportsPromptCacheKey: false` to opt out per-provider.
- `openai-completions` now drops prior-turn field-name-signature reasoning (`reasoning`/`reasoning_content`/`reasoning_text`) on replay, keeping only the last assistant turn's reasoning, to reduce re-billed input tokens on reasoning providers (e.g. GLM, llama.cpp, gpt-oss). Encrypted/redacted reasoning (`reasoning_details` from `thoughtSignature`; Anthropic `redacted_thinking`) is preserved.

## [0.79.6] - 2026-06-16

### Fixed

- Fixed OpenCode Go DeepSeek V4 thinking-off requests to send the provider's `thinking: { type: "disabled" }` compatibility parameter.

## [0.79.5] - 2026-06-16

### Added

- Added provider-scoped `StreamOptions.env` overrides for provider configuration, including Cloudflare endpoint placeholders, Azure OpenAI, Google Vertex, Amazon Bedrock, cache retention, and proxy environment lookups ([#5728](https://github.com/tsuuanmi/pi/issues/5728)).

### Fixed

- Fixed OpenAI Responses streaming to tolerate null message content from OpenAI-compatible servers before tool calls ([#5819](https://github.com/tsuuanmi/pi/issues/5819)).
- Fixed OpenCode DeepSeek V4 thinking requests to avoid sending both `thinking` and `reasoning_effort` ([#5818](https://github.com/tsuuanmi/pi/issues/5818)).
- Fixed Z.AI GLM-5.2 thinking requests to send `reasoning_effort` with the provider's `high`/`max` effort mapping ([#5770](https://github.com/tsuuanmi/pi/issues/5770)).
- Fixed Google and `google-vertex` Gemini model metadata to map `latest` aliases to the current models, add Gemini 3.5 Flash for Vertex, correct Gemini 2.5 Flash Vertex cache pricing, and remove shut-down Vertex preview models ([#5761](https://github.com/tsuuanmi/pi/issues/5761)).
- Fixed Moonshot AI China model metadata to include Kimi K2.7 Code, and omitted unsupported thinking-off payloads for Kimi K2.7 Code models ([#5760](https://github.com/tsuuanmi/pi/issues/5760)).

## [0.79.4] - 2026-06-15

### Fixed

- Fixed Anthropic 1-hour prompt-cache write cost accounting to price 1-hour cache writes at 2x input instead of the 5-minute cache-write rate ([#5738](https://github.com/tsuuanmi/pi/pull/5738) by [@theBucky](https://github.com/theBucky)).
- Fixed GitHub Copilot Claude adaptive-thinking effort metadata to match manually checked Copilot model capabilities ([#4637](https://github.com/tsuuanmi/pi/issues/4637)).
- Fixed OpenCode/OpenCode Go completion models that reject `prompt_cache_retention` to omit long-retention cache fields when `cacheRetention` is `long` ([#5702](https://github.com/tsuuanmi/pi/issues/5702)).

## [0.79.3] - 2026-06-13

### Fixed

- Restored OpenAI GPT-5.4/GPT-5.5 and OpenAI Codex GPT-5.4/GPT-5.4 mini/GPT-5.5 context window metadata to the observed 272k-token Codex backend limit, avoiding a billing hazard from sending prompts above Codex's accepted limit (reported by [@trethore](https://github.com/trethore)).

## [0.79.2] - 2026-06-12

### Added

- Added AWS data retention documentation links to Amazon Bedrock unsupported data retention mode validation errors ([#5561](https://github.com/tsuuanmi/pi/pull/5561) by [@unexge](https://github.com/unexge)).

### Fixed

- Fixed OpenAI-compatible context overflow detection for parenthesized `maximum context length (N)` errors ([#5677](https://github.com/tsuuanmi/pi/issues/5677)).
- Fixed OpenAI GPT-5.4/GPT-5.5 and OpenAI Codex GPT-5.4/GPT-5.4 mini/GPT-5.5 context window metadata to match current OpenAI limits ([#5644](https://github.com/tsuuanmi/pi/issues/5644)).
- Increased the OpenAI Codex Responses SSE response-header timeout to 20 seconds to reduce false-positive stalls while retaining the bounded wait introduced for zero-event hangs ([#4945](https://github.com/tsuuanmi/pi/issues/4945)).
- Fixed Anthropic refusal stops to preserve provider `stop_details` explanations in error messages ([#5666](https://github.com/tsuuanmi/pi/pull/5666) by [@rwachtler](https://github.com/rwachtler)).
- Fixed Claude Fable 5 thinking-off requests to omit Anthropic's unsupported `thinking.type: "disabled"` payload ([#5567](https://github.com/tsuuanmi/pi/pull/5567) by [@tmustier](https://github.com/tmustier)).

## [0.79.1] - 2026-06-09

### Added

- Added Claude Fable 5 to Anthropic and Amazon Bedrock model metadata, with adaptive thinking and `xhigh` effort support.

### Fixed

- Fixed Amazon Bedrock inference profile ARN region resolution to prefer the ARN's embedded region over `AWS_REGION` ([#5527](https://github.com/tsuuanmi/pi/pull/5527) by [@AJM10565](https://github.com/AJM10565)).
- Fixed z.ai thinking-off requests to send the provider's `thinking: { type: "disabled" }` compatibility parameter ([#5330](https://github.com/tsuuanmi/pi/issues/5330)).
- Fixed OpenCode completions model metadata to send explicit `maxTokens` as `max_tokens` ([#5331](https://github.com/tsuuanmi/pi/issues/5331)).
- Fixed Moonshot Kimi thinking-off requests to send the provider's `thinking: { type: "disabled" }` compatibility parameter ([#5531](https://github.com/tsuuanmi/pi/issues/5531)).
- Fixed Azure OpenAI Responses requests to disable server-side response storage ([#5530](https://github.com/tsuuanmi/pi/issues/5530)).
- Fixed Azure GPT-5.4 and GPT-5.5 context window metadata to 1,050,000 tokens, matching Azure Foundry deployments instead of OpenAI's 272k limit ([#5559](https://github.com/tsuuanmi/pi/issues/5559)).
- Fixed OpenAI and Azure GPT-5 Pro `maxTokens` metadata to 128,000, correcting an upstream value that duplicated the 272,000 input sub-limit as the output limit ([#5559](https://github.com/tsuuanmi/pi/issues/5559)).

## [0.79.0] - 2026-06-08

### Fixed

- Fixed OpenAI Responses custom providers to honor `compat.supportsDeveloperRole: false` for reasoning models ([#5456](https://github.com/tsuuanmi/pi/issues/5456)).
- Fixed OpenRouter routing preferences on OpenAI-compatible custom providers to send `compat.openRouterRouting` even when `baseUrl` does not point directly at OpenRouter ([#5347](https://github.com/tsuuanmi/pi/issues/5347)).

## [0.78.1] - 2026-06-04

### Added

- Added Ant Ling as a built-in OpenAI-compatible provider with Ling 2.6 and Ring 2.6 models.
- Added MiniMax-M3 model to the `minimax` and `minimax-cn` direct providers, and removed the hardcoded context-window override that was masking models.dev values ([#5313](https://github.com/tsuuanmi/pi/issues/5313)).
- Added NVIDIA NIM as a built-in OpenAI-compatible provider, exposing public NIM models that support tool use.

### Fixed

- Fixed Amazon Bedrock requests to replace blank required user/tool-result text with a placeholder and skip blank replay text blocks ([#4975](https://github.com/tsuuanmi/pi/issues/4975)).
- Fixed Anthropic Claude Opus 4.7+ requests to suppress deprecated temperature parameters ([#5251](https://github.com/tsuuanmi/pi/pull/5251) by [@yzhg1983](https://github.com/yzhg1983)).
- Fixed OpenAI GPT-5.5 generated metadata to omit unsupported minimal thinking ([#5243](https://github.com/tsuuanmi/pi/issues/5243)).
- Fixed OpenRouter Kimi K2.6 thinking replay and preserved developer-role instructions for OpenRouter OpenAI and Anthropic models ([#5309](https://github.com/tsuuanmi/pi/issues/5309)).
- Fixed OpenRouter reasoning instruction requests to preserve the system role when required ([#5221](https://github.com/tsuuanmi/pi/pull/5221) by [@PriNova](https://github.com/PriNova)).
- Restored the NVIDIA Qwen 3.5 122B NIM model.
