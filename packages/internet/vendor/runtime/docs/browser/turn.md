# `browser/turn.ts`

Provider-agnostic browser turn coordination.

## Responsibilities

- enforce a configured concurrent-turn limit;
- reject duplicate turns and turns during exclusive maintenance;
- serialize maintenance operations after active turns finish;
- provide abortable stage timeouts and lifecycle logging.

Provider adapters supply the turn action and diagnostic label. This module does not interpret
provider requests, responses, tools, models, or conversation state.
