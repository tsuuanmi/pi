# Skills

Agent skill loading and invocation utilities.

## `loadSkills()`

```typescript
async function loadSkills(options: {
  cwd: string;
  agentDir: string;
}): Promise<SkillLoadResult>
```

Loads skills from `agentDir/skills/` and project `.pi/skills/` directories.

## `Skill` Interface

```typescript
interface Skill {
  name: string;
  description?: string;
  instructions?: string;
  source: string;
  sourcePath?: string;
}
```

## `formatSkillInvocation()`

```typescript
function formatSkillInvocation(
  skill: Skill,
  additionalInstructions?: string,
): string
```

Formats a skill's instructions for inclusion in a system prompt.