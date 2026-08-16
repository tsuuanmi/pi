# browser/chatgpt-web/worker

Mirrors `src/browser/chatgpt-web/worker.ts`.

## Role

Owns ChatGPT browser-worker configuration, shared session lifetime, bounded turn admission, and
exclusive maintenance operations.

## Public surface

- `ResolvedBrowserConfig`;
- `resolveBrowserConfig`;
- `ChatGptBrowserWorker`;
- `closeChatGptBrowserWorkers`.

## Composition

The worker is intentionally small and delegates cohesive responsibilities:

| Module | Responsibility |
| --- | --- |
| `turn-driver.ts` | Turn stage composition, page leases, quarantine, and event callbacks |
| `interactions.ts` | Composer, model/effort, connector, prompt, and file interactions |
| `completion.ts` | Completion evidence, DOM health, traces, and response snapshots |
| `diagnostics.ts` | ChatGPT-specific diagnostic capture and redaction |
| `wire-capture.ts` | ChatGPT response matching over shared response-capture mechanics |
| `session.ts` | ChatGPT URLs, selectors, authentication, and account capabilities |
| `login.ts` | Interactive login and imported storage-state verification |

Reusable browser process, page-capacity, response-listener, stage, and turn-concurrency mechanics
live directly in `src/browser/` and contain no ChatGPT contracts.

## Lifecycle invariants

- one `BrowserSession` owns the maintenance page and managed conversation pages;
- `BrowserTurnRunner` blocks new turns during maintenance and shutdown;
- durable canary reopen verification uses a new managed page lease;
- shutdown drains turns and maintenance before closing the browser session.

## Source of truth

The implementation in `src/browser/chatgpt-web/worker.ts` is authoritative.
