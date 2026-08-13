# Internet — Best of Both: Hybrid Capture + Fusion "Ask All"

This document brainstorms two ideas that combine the strengths of Prometheus (network interception,
multi-provider) with the strengths of `internet` (Pi-native, browser-optional, DOM resilience):

1. **Hybrid capture** — use network interception as the primary model-output capture method, with
   DOM parsing as a resilient fallback.
2. **Fusion "ask all"** — fan a query across all enabled backends and synthesize one coherent
   answer (not just a side-by-side comparison).

Status: **proposal / brainstorm.** No code changes.

> **Source:** the capture and multi-provider ideas below are grounded in the Prometheus repo
> `/home/superman/workspaces/prometheus` (`src/provider-catalog.cjs`, `src/automation/*.cjs`,
> `src/mcp-server.js`) and the daemon repo `/home/superman/workspaces/codex-chatgpt-web`
> (`src/adapters/chatgpt-web/browser-worker.ts`).
> See [source-repositories.md](source-repositories.md).

---

## 1. The endpoint-vs-UI argument (settled)

The earlier comparison claimed DOM parsing is "more robust" than network interception. That was
**too simplistic**. The honest tradeoff:

| | Network interception | DOM parsing |
|---|---|---|
| What it captures | The raw wire stream (SSE/JSON) | The rendered answer the user sees |
| Stability of the contract | **High** — the official app depends on it; changes are deliberate/versioned | **Low** — the UI is cosmetic; changes are silent and frequent |
| Cost of an update | Localized (one parser/regex) | Can require re-mapping the whole DOM structure |
| Needs internal endpoints | Yes (can be obfuscated/auth-gated) | No |
| Survives transport changes (SSE→WebSocket) | No | Yes |
| Data richness | Reasoning, tool calls, usage, citations | Only what's rendered |

**Conclusion:** network interception is the **better primary** capture method (stable contract,
richer data). DOM parsing is the **better fallback** (resilient to transport/endpoint changes, no
internal endpoint knowledge). The right design is a **hybrid**, not either/or.

---

## 2. Hybrid capture strategy

```
captureModelOutput(page, provider):
  try:
    return interceptNetwork(provider)   # primary: match streaming endpoint, parse SSE/JSON
  catch (endpointChanged | opaqueFormat | transportChanged):
    return parseRenderedDom(page)       # fallback: read the assistant-turn DOM
```

### 2.1 Primary: network interception
- Install a `fetch`/WebSocket interceptor in the provider's browser context.
- Match the provider's streaming endpoint (e.g. ChatGPT `/backend-api/f/conversation`).
- Parse the SSE/JSON stream into text + reasoning + tool calls + usage.
- **Advantage:** stable contract, rich data, low update cost.

### 2.2 Fallback: DOM parsing
- If interception fails (endpoint changed, opaque format, WebSocket, auth-gated), read the rendered
  assistant-turn DOM.
- **Advantage:** resilient to transport/endpoint changes; no internal endpoint knowledge.

### 2.3 Why this is "best of both"
- **Stability** of the wire contract (interception primary).
- **Resilience** of the rendered DOM (fallback).
- **No single point of failure** — if one breaks, the other catches it.
- **Richer data** when interception works; **guaranteed answer** when it doesn't.

### 2.4 Mapping onto internet
- The `openai` backend's daemon currently uses DOM parsing. Add an **interception layer** as the
  primary path, keeping DOM as fallback.
- The future `anthropic` / `google` backends can use interception natively (they're API-based, so
  no browser needed — but if a browser path is ever added, the same hybrid applies).

---

## 3. Fusion "ask all"

### 3.1 The feature

`internet_ask_all(query)` fans a query across **all enabled backends** and returns **one fused
answer**, not a side-by-side comparison.

```
internet_ask_all(query)
  → fan out to all enabled backends (parallel)
  → collect answers
  → synthesize into ONE fused answer
  → return { fused, sources, disagreements }
```

### 3.2 The synthesis step

The fused answer needs a "synthesizer." Three options:

| Option | How | Pros | Cons |
|--------|-----|------|------|
| **Strongest backend** | Use the best backend (e.g. ChatGPT Pro) to merge the others | High quality | Costs a full turn on the strong model |
| **Dedicated cheap model** | A small model merges the answers | Cheap | Lower quality |
| **Heuristic merge** | Vote / longest / most-cited, no extra model call | Free, fast | No true synthesis |

**Recommended:** start with **heuristic merge** (free, fast, no extra model call), then add
**strongest-backend synthesis** as an opt-in for higher quality.

### 3.3 Return shape

```jsonc
{
  "fused": "The synthesized answer...",
  "sources": [
    { "backend": "chatgpt", "answer": "...", "agreement": "high" },
    { "backend": "claude",  "answer": "...", "agreement": "low" }
  ],
  "disagreements": ["Backend A says X, backend B says Y."]
}
```

### 3.4 Why fusion > compare
- **Ensemble reasoning** — multiple models cross-check each other, reducing hallucination.
- **One answer** — the agent gets a single coherent result, not N to reconcile.
- **Attribution** — the agent can cite which backend agreed/disagreed.

---

## 4. Feature roadmap update

| Priority | Feature | Notes |
|----------|---------|-------|
| P0 | Model routing (ChatGPT Web) | MVP, agreed |
| Implemented | `internet_search` + `internet_fetch` | Keyless RSS search plus bounded public-page fetch |
| Implemented | Daemon lifecycle + `internet_doctor` | Account-scoped structured diagnostics |
| Next | **Hybrid capture** (interception primary + DOM fallback) | Improves robustness of the ChatGPT Web path |
| Later | Multi-account + backend seam | Claude/Gemini API backends |
| Later | **`internet_ask_all` (fusion)** | Fan out + synthesize; heuristic first, strong-model opt-in |
| P4 | Full-mode tool bridge | Needs approval gate |

---

## 5. Risks and open questions

| Risk / question | Note |
|-----------------|------|
| Interception fragility | Endpoints can be obfuscated or auth-gated; the fallback covers this. |
| Fusion quality | Heuristic merge is crude; strong-model synthesis costs a turn. Make it opt-in. |
| Rate limits | Fanning out to N backends multiplies usage; add a concurrency cap. |
| Attribution accuracy | "Agreement" is heuristic; don't over-claim. |
| Where does fusion run? | In the `internet` package (orchestrates backends) or in the daemon? Prefer the package so it works across backends. |

---

## 6. Bottom line

- **Hybrid capture** gives the stability of network interception with the resilience of DOM parsing —
  the genuine "best of both."
- **Fusion "ask all"** is a real differentiator: ensemble reasoning that returns one coherent answer
  with attribution, not a comparison table.
- Both fit the `internet` package cleanly: hybrid capture improves the `openai` backend, and fusion
  is a cross-backend orchestration feature in the package.
