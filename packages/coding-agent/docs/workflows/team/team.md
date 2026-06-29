# Team Workflow

Runtime workflow for the team skill.

## Overview

The team workflow manages the team coordination board, persisting state to `.pi/team/<team-id>/`. It tracks worker tasks, messages, and completion evidence.

## State Files

- `.pi/team/<team-id>/state.json` — Team coordination state
- `.pi/team/<team-id>/tasks/` — Task definitions and evidence

## See Also

- [Team Package](../../../packages/workflows/team/team.md) - Package-level implementation details
- [Team Skill](../../skills/team/team.md)