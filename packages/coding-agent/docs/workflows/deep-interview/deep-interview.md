# Deep Interview Workflow

Runtime workflow for the deep-interview skill.

## Overview

The deep-interview workflow manages the interview state machine, persisting progress under the current session root at `.pi/<session-id>/workflows/deep-interview/`. It coordinates question planning, answer recording, scoring, and spec writing.

## State Files

- `.pi/<session-id>/workflows/deep-interview/state.json` — Current interview state
- `.pi/<session-id>/specs/deep-interview-<slug>.md` — Final spec output

## See Also

- [Deep Interview Package](../../../packages/workflows/deep-interview/deep-interview.md) - Package-level implementation details
- [Deep Interview Skill](../../skills/deep-interview/deep-interview.md)