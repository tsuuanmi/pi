# adapters/chatgpt-web/protocol/types

Mirrors `src/adapters/chatgpt-web/protocol/types.ts`.

## Role

Defines provider configuration, request/context messages, tools, adapter events, and usage contracts.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ParsedRequest` | interface — Structural type contract for callers and implementers. | 1 |
| `Context` | interface — Structural type contract for callers and implementers. | 46 |
| `Message` | type — Union or alias used to constrain protocol data. | 52 |
| `UserMessage` | interface — Structural type contract for callers and implementers. | 58 |
| `AssistantMessage` | interface — Structural type contract for callers and implementers. | 64 |
| `DeveloperMessage` | interface — Structural type contract for callers and implementers. | 73 |
| `ToolResultMessage` | interface — Structural type contract for callers and implementers. | 79 |
| `TextContent` | interface — Structural type contract for callers and implementers. | 93 |
| `ImageContent` | interface — Structural type contract for callers and implementers. | 98 |
| `ContentPart` | type — Union or alias used to constrain protocol data. | 107 |
| `ThinkingContent` | interface — Structural type contract for callers and implementers. | 109 |
| `ToolCall` | interface — Structural type contract for callers and implementers. | 118 |
| `AssistantContentPart` | type — Union or alias used to constrain protocol data. | 129 |
| `Tool` | interface — Structural type contract for callers and implementers. | 131 |
| `namespacedToolName` | function — Callable operation exposed to its callers. | 154 |
| `toolChoiceAliases` | function — Callable operation exposed to its callers. | 158 |
| `toolAllowedByChoice` | function — Callable operation exposed to its callers. | 163 |
| `resolveToolChoiceWireName` | function — Callable operation exposed to its callers. | 167 |
| `ToolChoice` | type — Union or alias used to constrain protocol data. | 172 |
| `isAllowedToolChoice` | function — Callable operation exposed to its callers. | 179 |
| `RequestOptions` | interface — Structural type contract for callers and implementers. | 183 |
| `MessagePhase` | type — Union or alias used to constrain protocol data. | 199 |
| `ProviderContinuationState` | interface — Structural type contract for callers and implementers. | 205 |
| `AdapterEvent` | type — Union or alias used to constrain protocol data. | 209 |
| `UrlCitation` | interface — Structural type contract for callers and implementers. | 265 |
| `Usage` | interface — Structural type contract for callers and implementers. | 279 |
| `ProviderConfig` | interface — Structural type contract for callers and implementers. | 291 |

## Behavior and invariants

- Protocol modules translate untrusted JSON and provider-neutral events at the Responses boundary.
- Schemas validate shape first; parser/state code then applies local continuation, compaction, tool, and provider-specific rules.
- Private continuation and reasoning artifacts are encoded explicitly and treated as opaque when they cannot be decoded safely.
- Defines canonical text/image/thinking/tool message unions and the `AdapterEvent` stream.
- Tool namespace helpers flatten MCP names for wire transport and resolve allowed choices back to canonical names.

## Source of truth

The implementation in `src/adapters/chatgpt-web/protocol/types.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
