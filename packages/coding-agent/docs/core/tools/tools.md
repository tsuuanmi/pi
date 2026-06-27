# Built-in Tools

Pi's built-in tool system providing file operations, shell execution, and code search.

## Overview

Pi ships with a set of built-in tools that the agent can use to interact with the filesystem, execute commands, and search code. Extensions can add additional tools or override built-in ones.

## Built-in Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents |
| `bash` | Execute shell commands |
| `edit` | Make surgical edits to files |
| `write` | Create or overwrite files |
| `grep` | Search file contents with regex |
| `find` | Search for files by name or pattern |
| `ls` | List directory contents |

## Tool Architecture

Each tool is composed of:

1. **Definition** — JSON schema for input parameters
2. **Implementation** — Async function that executes the tool
3. **Display** — Optional TUI rendering for tool calls and results

## Creating Custom Tools

Extensions can register tools via the `tools` export:

```typescript
export default {
  tools: [
    {
      name: "my-tool",
      description: "Does something useful",
      parameters: { /* TypeBox schema */ },
      execute: async (args) => {
        return { content: [{ type: "text", text: "result" }] };
      },
    },
  ],
};
```

## Tool Options

```typescript
interface ToolOptions {
  /** Working directory for execution */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}
```

## See Also

- [Extensions](../extensions/extensions.md) - Extension API and tool registration
- [Security](../trust/security.md) - Tool execution security