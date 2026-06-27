# System Prompt

Formatting skills for inclusion in system prompts.

## `formatSkillsForSystemPrompt()`

```typescript
function formatSkillsForSystemPrompt(skills: Skill[]): string
```

Formats an array of skills into a system prompt section. Each skill is listed with its name, description, and instructions.

Used by `AgentHarness` to inject available skills into the model's system prompt.