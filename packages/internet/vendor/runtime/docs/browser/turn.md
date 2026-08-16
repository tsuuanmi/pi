# `browser/turn.ts`

Provider-agnostic browser turn coordination.

## Responsibilities

- enforce a configured concurrent-turn limit;
- reject duplicate turns and turns during exclusive maintenance;
- serialize maintenance operations after active turns finish;
- provide stage deadlines, abort signals, and lifecycle logging.

Provider adapters supply the turn action and diagnostic label. This module does not interpret
provider requests, responses, tools, models, or conversation state.

## Cancellation contract

A timed-out stage aborts its signal and rejects with `BrowserStageTimeoutError`. Because an
arbitrary Playwright action may not observe cancellation, the stage owner supplies `onTimeout` to
close or quarantine the affected page. The timed-out action is observed so a later rejection cannot
become unhandled.

Maintenance blocks new turns, waits for active turns to settle, and then runs serially. Closing the
runner rejects new turns and maintenance before draining accepted work.
