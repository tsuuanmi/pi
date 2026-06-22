# MCP

Pi can load Model Context Protocol (MCP) servers at runtime and expose their tools to the agent as normal Pi tools.

## Config files

Pi reads MCP server config from:

- Project config: `.mcp.json`
- Global config: `~/.pi/mcp.json`

Project config is loaded only for trusted projects. If the same server name exists in both files, the project config wins.

Example `.mcp.json`:

```json
{
  "mcpConfigVersion": 1,
  "mcpServers": {
    "filesystem": {
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
      }
    },
    "remote": {
      "transport": {
        "type": "http",
        "url": "https://example.com/mcp"
      }
    }
  }
}
```

## CLI management

```bash
pi mcp list
pi mcp list --json
pi mcp add filesystem --command npx --args -y @modelcontextprotocol/server-filesystem .
pi mcp add filesystem --command npx --args -y @modelcontextprotocol/server-filesystem . --env API_KEY=sk-...
pi mcp add remote --url https://example.com/mcp
pi mcp remove filesystem
pi mcp test filesystem --timeout 10
```

`pi mcp add` writes to project `.mcp.json`. Use `--command <cmd>` (stdio) or `--url <url>` (HTTP/SSE); the two are mutually exclusive. `--args` consumes all following positional tokens as command arguments, and `--env KEY=VAL` (repeatable) sets environment variables on the stdio transport. `pi mcp test <name> [--timeout <sec>]` starts the configured server, performs the MCP initialize handshake, lists tools, and prints the tool count.

## Tool names

MCP tools are registered with names like:

```text
mcp__<server>__<tool>
```

Server names are sanitized before registration so tool names are safe for model tool calls.

## Extensions and MCP tools

Extensions observe MCP tools through normal tool events. MCP tools behave like any other registered tool.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (event.toolName.startsWith("mcp__")) {
      console.log("MCP call", event.toolName, event.input);
    }
  });

  pi.on("tool_result", (event) => {
    if (event.toolName.startsWith("mcp__")) {
      console.log("MCP result", event.toolName, event.isError);
    }
  });
}
```

Extensions can also dynamically register tools with `pi.registerTool()`. Those tools coexist with MCP-discovered tools and built-in tools.

## Scope

Phase 1 MCP support focuses on runtime tool execution:

- stdio transport
- HTTP/SSE transport
- tool discovery and calls
- project trust gate for `.mcp.json`
- CLI management and connectivity testing

Not included yet:

- OAuth setup flows
- server discovery marketplaces
- prompt/resource MCP surfaces
- per-tool approval gates
