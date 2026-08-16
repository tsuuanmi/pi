# providers/chatgpt-web/browser/worker

Mirrors `src/providers/chatgpt-web/browser/worker.ts`.

## Role

Owns the controlled Playwright browser worker and executes authenticated ChatGPT Web turns.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `closeChatGptBrowserWorkers` | function — Callable operation exposed to its callers. | 59 |
| `CHATGPT_RESPONSE_DOM_GRACE_MS` | const — Exported constant, schema, selector, or protocol marker. | 71 |
| `CHATGPT_EMPTY_RESPONSE_GRACE_MS` | const — Exported constant, schema, selector, or protocol marker. | 72 |
| `CHATGPT_COMPLETION_ACTION_GRACE_MS` | const — Exported constant, schema, selector, or protocol marker. | 73 |
| `CHATGPT_COMPLETION_SETTLE_MS` | const — Exported constant, schema, selector, or protocol marker. | 74 |
| `CHATGPT_TOOL_CONFIRMATION_TIMEOUT_MS` | const — Exported constant, schema, selector, or protocol marker. | 75 |
| `CHATGPT_UI_SETTLE_MS` | const — Exported constant, schema, selector, or protocol marker. | 82 |
| `throwIfChatGptRateLimitDialog` | function — Callable operation exposed to its callers. | 93 |
| `throwIfChatGptSessionFailureAlert` | function — Callable operation exposed to its callers. | 121 |
| `throwIfChatGptTerminalErrorAlert` | function — Callable operation exposed to its callers. | 133 |
| `resolveChatGptToolConfirmation` | function — Callable operation exposed to its callers. | 141 |
| `assertChatGptWebInputWithinLimits` | function — Callable operation exposed to its callers. | 177 |
| `CHATGPT_PROMPT_INSERT_CHUNK_CHARS` | const — Exported constant, schema, selector, or protocol marker. | 241 |
| `CHATGPT_COMPOSER_DOCUMENT_END_KEY` | const — Exported constant, schema, selector, or protocol marker. | 242 |
| `BrowserConversationTurn` | interface — Structural type contract for callers and implementers. | 262 |
| `BrowserTurn` | interface — Structural type contract for callers and implementers. | 271 |
| `ResolvedBrowserConfig` | interface — Structural type contract for callers and implementers. | 291 |
| `chatGptTurnIsComplete` | function — Callable operation exposed to its callers. | 304 |
| `ChatGptSubmissionEvidence` | type — Union or alias used to constrain protocol data. | 317 |
| `chatGptSubmissionEvidence` | function — Callable operation exposed to its callers. | 319 |
| `ChatGptCompletionTracker` | class — Stateful component with lifecycle or coordination methods. | 332 |
| `ChatGptTurnDomHealthTracker` | class — Stateful component with lifecycle or coordination methods. | 351 |
| `ChatGptVisibleTraceBlock` | interface — Structural type contract for callers and implementers. | 409 |
| `ChatGptVisibleTraceEvent` | interface — Structural type contract for callers and implementers. | 417 |
| `ChatGptVisibleTraceTracker` | class — Stateful component with lifecycle or coordination methods. | 442 |
| `isChatGptTraceControl` | function — Callable operation exposed to its callers. | 494 |
| `stripChatGptTraceControlSuffix` | function — Callable operation exposed to its callers. | 500 |
| `redactChatGptUiDiagnostic` | function — Callable operation exposed to its callers. | 506 |
| `browserDiagnosticCheckpoint` | function — Callable operation exposed to its callers. | 514 |
| `browserDiagnosticIncludesScreenshot` | function — Callable operation exposed to its callers. | 519 |
| `resolveBrowserConfig` | function — Callable operation exposed to its callers. | 656 |
| `chatGptImageFilePayloads` | function — Callable operation exposed to its callers. | 685 |
| `chatGptPromptFilePayloads` | function — Callable operation exposed to its callers. | 707 |
| `ChatGptBrowserWorker` | class — Stateful component with lifecycle or coordination methods. | 713 |

## Behavior and invariants

- This layer is the only module group that directly knows about ChatGPT Web DOM surfaces, selectors, tabs, and Playwright lifecycle.
- Browser state and UI evidence are validated before a turn is admitted; missing or contradictory evidence becomes a clear runtime failure.
- The worker reports protocol-neutral trace and turn events to the adapter rather than exposing Playwright objects to the HTTP layer.
- Tracks submission evidence, DOM health, visible traces, completion actions, tool confirmations, and terminal browser errors.
- Input insertion is chunked and bounded; completion grace periods cover delayed DOM/network events.

## Related source modules

- `providers/chatgpt-web/lifecycle/config.ts`
- `providers/chatgpt-web/protocol/types.ts`
- `providers/chatgpt-web/content/image.ts`
- `providers/chatgpt-web/conversation/canary.ts`
- `providers/chatgpt-web/content/markdown.ts`
- `providers/chatgpt-web/models/model.ts`
- `providers/chatgpt-web/content/tokens.ts`
- `providers/chatgpt-web/content/prompt.ts`
- `providers/chatgpt-web/browser/session.ts`
- `providers/chatgpt-web/browser/login.ts`
- `providers/chatgpt-web/models/models.ts`
- `providers/chatgpt-web/adapter-error.ts`
- `providers/chatgpt-web/transport/wire-capture.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/browser/worker.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
