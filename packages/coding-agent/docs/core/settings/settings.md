# Settings

Pi uses JSON settings files with project settings overriding global settings.

| Location | Scope |
|----------|-------|
| `~/.pi/agent/settings.json` | Global (all projects) |
| `.pi/settings.json` | Project (current directory) |

Edit directly or use `/settings` for common options.

## Project Trust

On interactive startup, pi asks before trusting a project folder that contains project-local settings, resources, or project `.agents/skills` and has no saved decision for the folder or a parent folder in `~/.pi/agent/trust.json`. Trusting a project allows pi to load `.pi/settings.json` and `.pi` resources, install missing project packages, and execute project extensions.

Non-interactive modes (`-p`, `--mode json`, and `--mode rpc`) do not show a trust prompt. Without an applicable saved trust decision, they use `defaultProjectTrust` from global settings: `ask` (default) and `never` ignore those project resources, while `always` trusts them.

If no extension or saved decision applies, `defaultProjectTrust` controls the fallback behavior. Set it to `"ask"`, `"always"`, or `"never"` in `~/.pi/agent/settings.json`, or change it with `/settings`.

`pi config` and package commands use the same project trust flow, except `pi update` never prompts.

Use `/trust` in interactive mode to save a project trust decision for future sessions, including trust for the immediate parent folder. It writes `~/.pi/agent/trust.json` only; the current session is not reloaded, so restart pi for changes to take effect.

## All Settings

### Model & Thinking

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `defaultProvider` | string | - | Default provider (e.g., `"anthropic"`, `"openai"`) |
| `defaultModel` | string | - | Default model ID |
| `defaultThinkingLevel` | string | - | `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"` |
| `agentModels` | object | `{}` | Per-agent profile model overrides keyed by agent name; configurable from `/settings` → Model & thinking → Roles |
| `agentThinkingLevels` | object | `{}` | Per-agent profile thinking-level overrides keyed by agent name; configurable from `/settings` → Model & thinking → Roles |
| `hideThinkingBlock` | boolean | `false` | Hide thinking blocks in output |

### UI & Display

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `theme` | string | `"dark"` | Theme name (`"dark"`, `"light"`, or custom) |
| `quietStartup` | boolean | `false` | Hide startup header |
| `defaultProjectTrust` | string | `"ask"` | Fallback project trust behavior: `"ask"`, `"always"`, or `"never"`. Global setting only |
| `showHardwareCursor` | boolean | `false` | Show the terminal cursor while TUI positions it for IME support |

#### Status Line

`statusLine` customizes the interactive status line. The default preset uses `model`, `mode`, `git`, and `path` on the left, and `session_name`, `subagents`, `token_in`, `token_out`, `context_pct`, and `context_total` on the right.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `statusLine.preset` | string | `"default"` | Built-in preset: `"default"` or `"custom"` |
| `statusLine.leftSegments` | string[] | preset value | Left-side segment IDs |
| `statusLine.rightSegments` | string[] | preset value | Right-side segment IDs |
| `statusLine.separator` | string | `"slash"` | Separator style: `"slash"`, `"pipe"`, `"dot"`, or `"space"` |
| `statusLine.segmentOptions` | object | preset value | Per-segment options for `model`, `path`, and `git` |

Segment IDs are `model`, `mode`, `git`, `path`, `context_pct`, `context_total`, `token_in`, `token_out`, `session_name`, and `subagents`. `thinking` is not a separate segment; use `segmentOptions.model.showThinkingLevel`.

```json
{
  "statusLine": {
    "preset": "custom",
    "leftSegments": ["model", "git", "path"],
    "rightSegments": ["session_name", "context_pct"],
    "separator": "pipe",
    "segmentOptions": {
      "model": { "showThinkingLevel": true, "showProviderPrefix": true },
      "path": { "abbreviate": true, "maxLength": 40, "stripWorkPrefix": false },
      "git": { "showBranch": true, "showStaged": true, "showUnstaged": true, "showUntracked": true }
    }
  }
}
```

### Network

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `httpProxy` | string | - | HTTP proxy URL applied as `HTTP_PROXY` and `HTTPS_PROXY`. Global setting only. |

```json
{
  "httpProxy": "http://127.0.0.1:7890"
}
```

### API Usage Logging

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `apiUsageLogging.enabled` | boolean | `true` | Write redacted sidecar API usage records to `<cwd>/.pi/{encodedSessionId}/api-usage.jsonl` |

See [API Usage Logging](../api-usage/api-usage-logging.md) for schema, privacy, and mode behavior.

```json
{
  "apiUsageLogging": {
    "enabled": false
  }
}
```

### Retained Context Optimization

Retained-context optimization is replay-only: session files, restored history, UI display, raw tool output, and extension `context` hooks stay raw. Provider-bound replay, including `before_provider_request` payload observers, may see optimized summaries.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `retainedContext.stripThinking` | boolean | `true` | Strip removable readable thinking blocks from future model replay while preserving signed/redacted/opaque continuity data |
| `retainedContext.compressBashOutput` | boolean | `true` | Compress oversized retained bash outputs in provider-bound replay only |
| `retainedContext.bashMaxBytes` | number | `16384` | UTF-8 byte budget for retained bash output compression |
| `retainedContext.dedupeReadResults` | boolean | `true` | Replace older content-identical duplicate `read` results with deterministic summary records |
| `retainedContext.summarizeStaleToolResults` | boolean | `true` | Summarize old unprotected non-error `read`, `bash`, and `edit` results when over budget |
| `retainedContext.toolResultMaxBytes` | number | `96000` | Best-effort budget for unprotected eligible retained tool-result bytes |

Duplicate read summaries require matching normalized path, offset/limit, SHA-256, and byte count. Same-path reads with different output fail open and remain raw for duplicate-dedupe purposes. Current/unconsumed batches, the latest completed batches, and `isError: true` tool results remain raw even if that exceeds the budget.

```json
{
  "retainedContext": {
    "dedupeReadResults": false,
    "summarizeStaleToolResults": false,
    "toolResultMaxBytes": 96000
  }
}
```

### Compaction

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `compaction.enabled` | boolean | `true` | Enable auto-compaction |
| `compaction.reserveTokens` | number | `16384` | Tokens reserved for LLM response |
| `compaction.keepRecentTokens` | number | `20000` | Recent tokens to keep (not summarized) |

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

### Branch Summary

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `branchSummary.reserveTokens` | number | `16384` | Tokens reserved for branch summarization |
| `branchSummary.skipPrompt` | boolean | `false` | Skip "Summarize branch?" prompt on `/tree` navigation (defaults to no summary) |

### Retry

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `retry.enabled` | boolean | `true` | Enable automatic agent-level retry on transient errors |
| `retry.maxRetries` | number | `3` | Maximum agent-level retry attempts |
| `retry.baseDelayMs` | number | `2000` | Base delay for agent-level exponential backoff (2s, 4s, 8s) |
| `retry.provider.timeoutMs` | number | SDK default | Provider/SDK request timeout in milliseconds |
| `retry.provider.maxRetries` | number | `0` | Provider/SDK retry attempts |
| `retry.provider.maxRetryDelayMs` | number | `60000` | Max server-requested delay before failing (60s) |

When a provider requests a retry delay longer than `retry.provider.maxRetryDelayMs` (e.g., "quota will reset after 5h"), the request fails immediately with an informative error instead of waiting silently. Set to `0` to disable the cap.

Keep `retry.provider.maxRetries` at `0` unless provider-level retries are explicitly needed. Setting it above `0` can make SDK/provider retries handle out-of-usage-limit errors before Pi sees them, which may block the agent until the provider quota resets in some circumstances.

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "timeoutMs": 3600000,
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  }
}
```

### Message Delivery

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `steeringMode` | string | `"one-at-a-time"` | How steering messages are sent: `"all"` or `"one-at-a-time"` |
| `followUpMode` | string | `"one-at-a-time"` | How follow-up messages are sent: `"all"` or `"one-at-a-time"` |
| `transport` | string | `"auto"` | Preferred transport for providers that support multiple transports: `"sse"`, `"websocket"`, `"websocket-cached"`, or `"auto"` |
| `httpIdleTimeoutMs` | number | `300000` | HTTP header/body idle timeout in milliseconds, also used by providers with explicit stream idle timeouts. Set to `0` to disable. |
| `websocketConnectTimeoutMs` | number | `15000` | WebSocket connect/open handshake timeout in milliseconds for providers that support WebSocket transports. Set to `0` to disable. |

### Shell

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `shellPath` | string | - | Custom shell path |
| `shellCommandPrefix` | string | - | Prefix for every bash command (e.g., `"shopt -s expand_aliases"`) |
| `npmCommand` | string[] | - | Command argv used for npm package lookup/install operations (e.g., `["mise", "exec", "node@20", "--", "npm"]`) |

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

`npmCommand` is used for all npm package-manager operations, including installs, uninstalls, and dependency installs inside git packages. User-scoped npm packages install under `~/.pi/agent/npm/`; project-scoped npm packages install under `.pi/npm/`. Use argv-style entries exactly as the process should be launched. When `npmCommand` is configured, git package dependency installs use plain `install` to avoid npm-specific flags in wrappers or alternate package managers.

### Sessions

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sessionDir` | string | - | Directory where session files are stored. Accepts absolute or relative paths, plus `~`. |

```json
{ "sessionDir": ".pi/sessions" }
```

When multiple sources specify a session directory, precedence is `PI_CODING_AGENT_SESSION_DIR`, then `sessionDir` in settings.json.

### Model Scope

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabledModels` | string[] | - | Model patterns that constrain startup model resolution (same pattern format as `--model`) |

```json
{
  "enabledModels": ["claude-*", "gpt-*", "o3-*"]
}
```

### Markdown

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `markdown.codeBlockIndent` | string | `"  "` | Indentation for code blocks |

### Resources

These settings define where to load extensions, skills, prompts, themes, and package commands from.

Paths in `~/.pi/agent/settings.json` resolve relative to `~/.pi/agent`. Paths in `.pi/settings.json` resolve relative to `.pi`. Absolute paths and `~` are supported.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `packages` | array | `[]` | npm/git packages to load resources from |
| `extensions` | string[] | `[]` | Local extension file paths or directories |
| `skills` | string[] | `[]` | Local skill file paths or directories |
| `prompts` | string[] | `[]` | Local prompt template paths or directories |
| `themes` | string[] | `[]` | Local theme file paths or directories |
| `commands` | string[] | `[]` | Local package command file paths or directories |
| `enableSkillCommands` | boolean | `true` | Register skills as `/skill:name` commands |

Arrays support glob patterns and exclusions. Use `!pattern` to exclude. Use `+path` to force-include an exact path and `-path` to force-exclude an exact path.

#### packages

String form loads all resources from a package:

```json
{
  "packages": ["pi-skills", "@org/my-extension"]
}
```

Object form filters which resources to load:

```json
{
  "packages": [
    {
      "source": "pi-skills",
      "skills": ["brave-search", "transcribe"],
      "extensions": [],
      "commands": []
    }
  ]
}
```

See [packages.md](../../packages.md) for package management details.

## Example

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "defaultThinkingLevel": "medium",
  "theme": "dark",
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3
  },
  "enabledModels": ["claude-*", "gpt-4o"],
  "packages": ["pi-skills"]
}
```

## Project Overrides

Project settings (`.pi/settings.json`) override global settings. Nested objects are merged:

```json
// ~/.pi/agent/settings.json (global)
{
  "theme": "dark",
  "compaction": { "enabled": true, "reserveTokens": 16384 }
}

// .pi/settings.json (project)
{
  "compaction": { "reserveTokens": 8192 }
}

// Result
{
  "theme": "dark",
  "compaction": { "enabled": true, "reserveTokens": 8192 }
}
```
