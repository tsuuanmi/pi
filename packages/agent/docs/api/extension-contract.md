# Extension Contract

`src/api/extension-contract.ts` defines the minimal host surface that extension packages can depend on without importing the full pi host.

## Tool contract

```typescript
interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown, _TState = any> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: TParams;
  renderShell?: "default" | "self";
  prepareArguments?: (args: unknown) => Static<TParams>;
  executionMode?: ToolExecutionMode;
  execute(toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<TDetails>>;
}
```

The pi host adds rendering-specific fields on top of this lower-layer contract.

`ToolInfo` is the metadata shape returned by `ExtensionAPI.getAllTools()` and includes `name`, `description`, `parameters`, optional `promptGuidelines`, and `sourceInfo`.

## Context contract

```typescript
type ExtensionMode = "tui" | "rpc" | "json" | "print";

interface ExtensionUIContext {
  setStatus(key: string, text: string | undefined): void;
  setWidget(key: string, content: string[] | undefined, options?: { placement?: string }): void;
}

interface ExtensionContext {
  ui: ExtensionUIContext;
  mode: ExtensionMode;
  cwd: string;
  sessionManager: { getSessionId(): string };
  subagents?: SubagentManager;
  skipAutomaticContinuation: boolean;
  getSystemPrompt(): string;
}
```

## Events

`ExtensionAPI.on()` supports these events:

- `session_start` with reason `startup`, `reload`, `new`, `resume`, or `fork`, plus optional `previousSessionFile`.
- `turn_end`.
- `tool_execution_end`.
- `before_agent_start`, whose handler may return `{ systemPrompt?: string }`.
- `tool_call`, whose handler may return `{ block?: boolean; reason?: string }`.

Handlers can be synchronous or async and may return `void`.

## API contract

```typescript
interface ExtensionAPI {
  on(...): void;
  registerTool(tool): void;
  registerFlag?(name, options): void;
  getFlag(name: string): boolean | string | undefined;
  getActiveTools(): string[];
  getAllTools(): ToolInfo[];
  setActiveTools(toolNames: string[]): void;
}
```

`registerFlag()` is optional so lower-layer consumers can work with hosts that do not expose flag registration.
