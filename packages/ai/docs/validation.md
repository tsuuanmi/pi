# Validation

The package provides TypeBox-based tool argument validation for use with `stream()` and `complete()`.

## `validateToolCall()`

Validates and parses tool call arguments against the tool's TypeBox schema:

```typescript
import { validateToolCall } from "@tsuuanmi/pi-ai";

try {
  const validatedArgs = validateToolCall(tools, toolCall);
  // validatedArgs is the parsed and type-checked arguments object
  const result = await executeMyTool(toolCall.name, validatedArgs);
} catch (error) {
  // Validation failed — return error to the model
  context.messages.push({
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: [{ type: "text", text: error.message }],
    isError: true,
    timestamp: Date.now(),
  });
}
```

When using the agent package's `AgentLoop` or `AgentHarness`, tool arguments are automatically validated before execution. The `validateToolCall` function is intended for manual tool execution loops using `stream()` or `complete()` directly.

## Validation Details

The validator:

1. Looks up the tool by name in the provided tool array
2. Compiles the TypeBox schema with `TypeBox/Compile` (cached via `WeakMap`)
3. Validates the raw arguments using `TypeBox/Value`
4. Returns the parsed and validated arguments object

If the tool is not found or arguments fail validation, an error is thrown with a descriptive message that can be returned to the LLM for retry.

## Custom Schemas

Validation works with any TypeBox schema, including nested objects, arrays, and `StringEnum`:

```typescript
import { Type, StringEnum, validateToolCall } from "@tsuuanmi/pi-ai";

const tools = [{
  name: "search",
  description: "Search for items",
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
    category: StringEnum(["books", "movies", "music"], { default: "books" }),
    limit: Type.Number({ minimum: 1, maximum: 100 }),
    filters: Type.Optional(Type.Array(Type.String())),
  }),
}];
```

The validator also handles schemas that mix TypeBox metadata with plain JSON Schema. It detects TypeBox schemas by the `Symbol.for("TypeBox/Kind")` symbol and falls back to JSON Schema validation for plain objects.