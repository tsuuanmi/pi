# Configuration

Pi configuration system with global and project-level settings, experimental features, and config value resolution.

## Configuration Hierarchy

Settings are resolved in order of priority (highest wins):

1. **CLI flags** — `--model`, `--thinking-level`, etc.
2. **Project settings** — `.pi/settings.json`
3. **User settings** — `~/.pi/agent/settings.json`
4. **Default values**

Nested objects are deep-merged. For example, project `compaction.reserveTokens` overrides the global value while preserving other compaction settings.

Settings use a strict schema. Invalid JSON, unknown fields, invalid values, and insecure permissions stop startup. Setters complete their lock-protected atomic write before returning.

## Settings File

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-5",
  "defaultThinkingLevel": "medium",
  "steeringMode": "one-at-a-time",
  "followUpMode": "one-at-a-time",
  "extensions": ["./my-extension.ts"],
  "skills": ["./my-skill.md"],
  "prompts": ["./my-prompt.md"],
  "themes": ["./my-theme.json"]
}
```

## Config Value Resolution

`resolveConfigValue(config, env?)` resolves string values that may contain environment variable references:

- Plain strings are returned as-is
- `${ENV_VAR}` references are expanded using `process.env`
- If the referenced env var is missing, the function returns `undefined`
- An optional `env` record provides additional variables for resolution
- `resolveConfigValueOrThrow(config, description, env?)` throws if resolution fails

This is used by API key credentials and other configurable values that support environment variable interpolation.

## Agent Directory

`getAgentDir()` returns `~/.pi/agent/` by default. This can be overridden with the `PI_AGENT_DIR` environment variable.

`getDocsPath()` returns the path to the bundled documentation directory, used by auth guidance messages.

## See Also

- [Settings](../settings/index.md) - Full settings reference
- [Authentication](../auth/index.md) - Auth configuration and credential storage