# backends/openai/turn/model

Mirrors `src/backends/openai/turn/model.ts`.

Model route definitions, reasoning levels, and the Luna special case.

## Constants

- `CHATGPT_WEB_PROVIDER` — `"chatgpt-web"`.
- `CHATGPT_WEB_LUNA_MODEL_ROUTE` — the Luna route: id `chatgpt-web/luna`, reasoning `low`, no Pro
  requirement, context window `1_050_000`.
- `CONSERVATIVE_MAX_OUTPUT_TOKENS` — `16_384`, used as `maxTokens` for every route.

## Types

- `ChatGptWebModelId` — `light`/`medium`/`high`/`extra-high`/`pro`/`luna` under `chatgpt-web/`.
- `ChatGptWebReasoningLevel` — `"low" | "medium" | "high" | "xhigh" | "ultra"`.
- `ChatGptWebModelRoute` — id, name, reasoning level, `requiresPro`, `contextWindow`, `maxTokens`.

## `CHATGPT_WEB_MODEL_ROUTES`

The standard (non-Luna) routes:

| id | name | reasoning | requiresPro | contextWindow |
|---|---|---|---|---|
| `chatgpt-web/light` | ChatGPT Web — Instant | low | no | 41_000 |
| `chatgpt-web/medium` | ChatGPT Web — Medium | medium | no | 90_000 |
| `chatgpt-web/high` | ChatGPT Web — High | high | no | 90_000 |
| `chatgpt-web/extra-high` | ChatGPT Web — Extra High | xhigh | yes | 111_193 |
| `chatgpt-web/pro` | ChatGPT Web — Pro | ultra | yes | 112_193 |

## `isLunaModel`

```ts
isLunaModel(model: string): boolean
```

Returns true when `model === "chatgpt-web/luna"`. Used to block separate compaction, because Luna
uses rolling checkpoints.
