# Internet vs. Prometheus — Comparison

This document compares the `internet` Pi package (this repo) with
[Prometheus](https://github.com/.../prometheus) (`/home/superman/workspaces/prometheus`), which
pursues the same core idea: **use browser-based AI products (ChatGPT, Claude, Gemini, ...) as model
backends without API keys.** The two projects overlap heavily in intent but differ sharply in
architecture, scope, and integration surface.

> **Source:** both repos are on disk for inspection:
> - Prometheus: `/home/superman/workspaces/prometheus` (`src/mcp-server.js`, `src/provider-catalog.cjs`,
>   `electron/rest-api.cjs`, `src/automation/*.cjs`)
> - Daemon (what `internet` wraps): `/home/superman/workspaces/codex-chatgpt-web`
>   (`src/server.ts`, `src/bridge.ts`, `src/adapters/chatgpt-web/browser-worker.ts`)
>
> See [source-repositories.md](source-repositories.md) for the full file map.

Status: **analysis.** No code changes.

---

## 1. The shared idea

Both projects answer the same question: *"How do I use ChatGPT/Claude/Gemini as a model backend
without paying for an API key?"* The answer in both cases is: **drive a real browser session against
the product's web UI and capture the model's streaming response.**

| | Prometheus | internet |
|---|---|---|
| Core mechanism | Electron app drives browser sessions; intercepts `fetch`/SSE to capture model output | codex-chatgpt-web daemon drives Chrome; parses the rendered DOM to capture model output |
| Model backends | ChatGPT, Claude, Gemini, GoogleAI, DeepSeek, Grok, Z.ai, Copilot, Meta AI, Qwen, Perplexity (11) | MVP: ChatGPT Web only. Future: Claude, Gemini (via API) |
| Integration surface | MCP server (stdio) + REST API (`/v1/chat/completions`) | Pi package (extension) — registers as a Pi provider + tools |
| Host | Standalone Electron desktop app | Pi agent (extension) |

---

## 2. Architecture comparison

### 2.1 How the model output is captured

This is the **biggest architectural difference**.

- **Prometheus** uses **network interception**: it installs a `fetch` interceptor in each provider's
  `BrowserView` that matches the provider's streaming endpoints (e.g. ChatGPT `/backend-api/f/conversation`,
  Claude `/completion`, Gemini `BimAJc`) and parses the SSE/JSON stream directly. It captures the raw
  wire response, not the rendered DOM.

- **internet** (via codex-chatgpt-web) uses **DOM parsing**: it types the prompt into the ChatGPT
  composer, then reads the rendered assistant-turn DOM, extracting markdown segments and reasoning
  summaries. It does **not** intercept the network.

| Capture method | Prometheus | internet |
|---|---|---|
| Network `fetch`/SSE interception | ✅ primary | ❌ |
| DOM / rendered-content parsing | ❌ | ✅ primary |
| Per-provider stream parser | ✅ (per-provider `interceptor.parser`) | ❌ (single ChatGPT DOM path) |
| Robust to UI layout changes | ❌ (breaks when DOM/endpoints change) | ✅ (DOM is the contract) |
| Robust to network/API changes | ✅ (reads the wire) | ❌ (breaks when endpoints change) |

### 2.2 Provider model

- **Prometheus** has a **provider catalog** (`src/provider-catalog.cjs`) with 11 providers, each
  with `loginCheckScript`, `interceptor` (urlPatterns/streamTypes/parser), aliases, and a browser
  partition. Adding a provider = adding a catalog entry + a sender script
  (`electron/provider-senders/<provider>.cjs`).

- **internet** has a **backend seam** (`src/backends/`) with per-backend folders. MVP ships
  `openai/` (ChatGPT Web via the daemon); `anthropic/` and `google/` are stubs. The key difference:
  internet's future Claude/Gemini backends are **API-based (browser-less)**, not browser-driven.

| | Prometheus | internet |
|---|---|---|
| Provider count | 11 (browser-driven) | 1 MVP (browser) + future API backends |
| Adding a provider | Catalog entry + sender script + interceptor | Backend folder + `register(pi, accounts)` |
| Claude/Gemini | Browser-driven (claude.ai, gemini.google.com) | Future: API-based (browser-less) |
| Browser required | Always (all providers) | Only for ChatGPT Web model routing |

### 2.3 Integration surface

- **Prometheus** exposes an **MCP server** (stdio) with ~56 tools (`ask_chatgpt`, `ask_claude`,
  `deep_search`, `run_skill`, `router_stats`, ...) plus a **REST API** (`/v1/chat/completions`,
  `/v1/models`, `/v1/functions`). It is a standalone service any MCP client can connect to.

- **internet** is a **Pi package** that registers the daemon as a Pi `openai-responses` provider and
  adds Pi tools (`internet_search`, `internet_fetch`, `internet_status`, `internet_compact`). It
  plugs into the Pi agent, not a generic MCP/REST surface.

| | Prometheus | internet |
|---|---|---|
| MCP server | ✅ (stdio, ~56 tools) | ❌ (uses Pi's tool registry) |
| REST API | ✅ (`/v1/chat/completions`) | ❌ (talks to the daemon's `/v1/responses`) |
| Pi provider registration | ❌ | ✅ (`registerProvider("chatgpt-web", ...)`) |
| Skills | ✅ (markdown files, `run_skill`) | ❌ (MVP has no skill; tools only) |
| Multi-account | Per-provider browser partitions | Per-account daemon instances |

### 2.4 Browser requirement

- **Prometheus** is **browser-only by design** — every provider is a browser session. There is no
  browser-less path.

- **internet** is **browser-optional**: only the ChatGPT Web model-routing path needs the daemon's
  Chrome. `internet_search` / `internet_fetch` and the future Claude/Gemini API backends are
  browser-less.

| | Prometheus | internet |
|---|---|---|
| Browser required for model routing | ✅ (all) | ✅ (ChatGPT Web only) |
| Browser required for search/fetch | ✅ (browser-based) | ❌ (API passthrough) |
| Browser-less future backends | ❌ | ✅ (Claude/Gemini API) |

---

## 3. Feature comparison table

| Feature | Prometheus | internet |
|---------|-----------|----------|
| Use ChatGPT Web as a model | ✅ | ✅ (MVP) |
| Use Claude / Gemini as a model | ✅ (browser) | 🔜 (future API) |
| Use DeepSeek / Grok / Z.ai / Copilot / Meta AI / Qwen / Perplexity | ✅ | ❌ (not planned) |
| Web search | ✅ (`deep_search`, `pro_search`, `youtube_search`, ...) | 🔜 (`internet_search` via daemon) |
| Fetch a URL | ✅ (`summarize_url`) | 🔜 (`internet_fetch`) |
| Multi-provider routing | ✅ (`smart_query`, `ask_all_ais`, `compare_ais`) | ❌ (single backend MVP) |
| Multi-account per provider | ✅ (browser partitions) | 🔜 (daemon instances) |
| Compaction / context summarization | ✅ (`convo_history_summarize`) | 🔜 (`internet_compact`) |
| Skills | ✅ (8 skills) | ❌ (MVP has no skill) |
| MCP server | ✅ | ❌ |
| REST API | ✅ | ❌ |
| Pi integration | ❌ | ✅ |
| Browser-less operation | ❌ | ✅ (partial) |
| Model aliases | ✅ | ❌ |
| Per-provider stream parser | ✅ | ❌ |

---

## 4. What internet can learn from Prometheus

1. **Multi-provider is the killer feature.** Prometheus's 11-provider catalog is its main draw.
   internet's backend seam already anticipates this; the roadmap should prioritize Claude/Gemini
   (API-based) to match the breadth without the browser cost.

2. **Model aliases + smart routing** (`ask_all_ais`, `compare_ais`, `smart_query`) are compelling.
   internet could add a `internet_ask_all` / `internet_compare` that fans a query across enabled
   backends and returns a comparison.

3. **Skills are a proven pattern.** Prometheus ships 8 markdown skills. internet could adopt a
   similar skill set later (e.g. `internet-research`, `internet-summarize`) once the MVP tool
   surface is stable.

4. **Per-provider automation is fragile.** Prometheus's network-interception approach breaks when
   endpoints change. internet's DOM-parsing approach (via the daemon) is more robust for ChatGPT;
   keep that advantage rather than copying the interceptor model.

## 5. What Prometheus can learn from internet

1. **Pi integration.** Prometheus is a standalone app; registering as a Pi provider would let it
   serve as a model backend inside Pi, not just an MCP/REST service.

2. **Browser-less search/fetch.** Prometheus's search is browser-based; a native API passthrough
   (like internet's `/v1/alpha/search`) would be lighter.

3. **Backend seam.** Prometheus's provider catalog is monolithic; a per-backend folder seam (like
   internet's `src/backends/`) would make adding API-based providers cleaner.

---

## 6. Bottom line

Prometheus and internet are **siblings** — same core idea, different execution. Prometheus is a
**broad, browser-only, standalone MCP/REST service** (11 providers, network interception). internet
is a **narrow, browser-optional, Pi-native package** (ChatGPT Web MVP, DOM parsing, future API
backends). The two are complementary: internet could adopt Prometheus's multi-provider breadth and
smart-routing ideas, while Prometheus could adopt internet's Pi integration and browser-less
search/fetch.
