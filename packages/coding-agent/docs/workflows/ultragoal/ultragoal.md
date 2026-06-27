# Ultragoal Workflow

Runtime workflow for the ultragoal skill.

## Overview

The ultragoal workflow manages the goal-tracking state machine, persisting progress to `.pi/workflows/ultragoal/`. Each goal has quality gates that must pass before marking as complete.

## State Files

- `.pi/workflows/ultragoal/state.json` — Current goal state
- `.pi/workflows/ultragoal/goals.json` — Goal definitions
- `.pi/workflows/ultragoal/ledger.jsonl` — Goal transition log

## Quality Gates

Each goal completion requires:
- **Evidence**: Summary of what was done
- **Surface Evidence**: Verification that the goal criteria are met
- **Contract Coverage**: Each acceptance criterion is covered
- **Executor QA**: Artifact references and verification

## See Also

- [Ultragoal Skill](../../skills/ultragoal/ultragoal.md)