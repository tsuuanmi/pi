# Deep Interview Skill

Socratic requirements interview with ambiguity scoring before planning or execution.

## Overview

The deep-interview skill conducts a structured interview to expose assumptions and resolve ambiguities before planning or execution begins. It is triggered for vague, complex, or high-risk requests.

## Usage

```bash
/skill:deep-interview [--quick|--standard|--deep] <idea>
```

| Mode | Description |
|------|-------------|
| `--quick` | Fewer rounds, broader questions |
| `--standard` | Default depth |
| `--deep` | More rounds, deeper probing |

## Workflow

1. Plan the next interview question
2. Record the user's answer
3. Score ambiguity and identify contradictions
4. Repeat until ambiguity is below threshold
5. Write a final spec to `.pi/<session-id>/specs/`

## See Also

- [Workflow](../workflow.md) - Pi workflow control plane