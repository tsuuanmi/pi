# Configuration

Pi configuration system with global and project-level settings.

## Configuration Hierarchy

Settings are resolved in order of priority (highest wins):

1. **CLI flags** — `--model`, `--thinking-level`, etc.
2. **Project settings** — `.pi/settings.json`
3. **User settings** — `~/.pi/agent/settings.json`
4. **Default values**

## Settings File

```json
{
  "model": "claude-4-sonnet",
  "thinkingLevel": "medium",
  "steeringMode": "one-at-a-time",
  "followUpMode": "one-at-a-time",
  "customTools": ["my-tool"],
  "excludeTools": [],
  "extensions": ["./my-extension.ts"],
  "skills": ["./my-skill.md"],
  "prompts": ["./my-prompt.md"],
  "themes": ["./my-theme.ts"]
}
```

## See Also

- [Settings](../settings/settings.md) - Full settings reference