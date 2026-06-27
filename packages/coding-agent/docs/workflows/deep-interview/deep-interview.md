# Deep Interview Workflow

Runtime workflow for the deep-interview skill.

## Overview

The deep-interview workflow manages the interview state machine, persisting progress to `.pi/workflows/deep-interview/`. It coordinates question planning, answer recording, scoring, and spec writing.

## State Files

- `.pi/workflows/deep-interview/state.json` — Current interview state
- `.pi/specs/deep-interview-<slug>.md` — Final spec output

## See Also

- [Deep Interview Skill](../../skills/deep-interview/deep-interview.md)