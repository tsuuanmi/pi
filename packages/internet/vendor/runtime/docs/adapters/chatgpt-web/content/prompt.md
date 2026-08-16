# adapters/chatgpt-web/content/prompt

Mirrors `src/adapters/chatgpt-web/content/prompt.ts`.

## Role

Builds browser prompts and Full-mode context notices from parsed provider requests.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ChatGptWebPromptImage` | interface — Structural type contract for callers and implementers. | 9 |
| `CompiledChatGptWebPrompt` | interface — Structural type contract for callers and implementers. | 15 |
| `CompileChatGptWebPromptOptions` | interface — Structural type contract for callers and implementers. | 22 |
| `withoutRetiredTurnHandles` | function — Callable operation exposed to its callers. | 33 |
| `CHATGPT_MAX_INPUT_IMAGES` | const — Exported constant, schema, selector, or protocol marker. | 38 |
| `CHATGPT_COMPACTION_PROMPT_JSON_BYTE_BUDGET` | const — Exported constant, schema, selector, or protocol marker. | 49 |
| `chatGptPromptJsonBytes` | function — Callable operation exposed to its callers. | 51 |
| `countChatGptContextImages` | function — Callable operation exposed to its callers. | 89 |
| `withoutSupersededModelSwitchContracts` | function — Callable operation exposed to its callers. | 129 |
| `chatGptFullModeContextWarning` | function — Callable operation exposed to its callers. | 168 |
| `compileChatGptWebPrompt` | function — Callable operation exposed to its callers. | 178 |

## Behavior and invariants

- Content helpers translate between internal message parts and browser-facing prompt/Markdown representations.
- Images remain typed image content, while token and usage helpers make estimates explicit instead of presenting them as provider-authoritative values.
- This boundary prevents DOM/HTML conversion and prompt-size policy from spreading into protocol and route modules.
- Combines system instructions, messages, tools, and runtime metadata into browser input.
- Preserves tool namespace and custom/freeform semantics for the broker.

## Related source modules

- `adapters/chatgpt-web/protocol/types.ts`
- `adapters/chatgpt-web/protocol/responses/compaction.ts`
- `adapters/chatgpt-web/models/model.ts`
- `adapters/chatgpt-web/conversation/rolling-checkpoint.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/content/prompt.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
