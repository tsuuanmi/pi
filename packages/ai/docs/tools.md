# Tools

Tools enable LLMs to interact with external systems. The library uses TypeBox schemas for type-safe tool definitions with automatic validation.

## Defining Tools

```typescript
import { Type, Tool, StringEnum } from "@tsuuanmi/pi-ai";

const weatherTool: Tool = {
  name: "get_weather",
  description: "Get current weather for a location",
  parameters: Type.Object({
    location: Type.String({ description: "City name or coordinates" }),
    units: StringEnum(["celsius", "fahrenheit"], { default: "celsius" }),
  }),
};
```

### `StringEnum` Helper

Use `StringEnum` instead of `Type.Enum` for tool parameter enums. `Type.Enum` generates `anyOf/const` patterns that some providers do not support:

```typescript
import { StringEnum } from "@tsuuanmi/pi-ai";

const units = StringEnum(["celsius", "fahrenheit"], { default: "celsius" });
// Generates: { type: "string", enum: ["celsius", "fahrenheit"], default: "celsius" }
```

## Tool Call Lifecycle

### 1. Model Requests a Tool Call

During streaming, tool call arguments arrive incrementally:

```typescript
for await (const event of stream(model, context)) {
  if (event.type === "toolcall_delta") {
    const toolCall = event.partial.content[event.contentIndex];
    if (toolCall.type === "toolCall" && toolCall.arguments) {
      // Arguments may be incomplete during streaming
      console.log(`Streaming args for ${toolCall.name}:`, toolCall.arguments);
    }
  }
  if (event.type === "toolcall_end") {
    // Arguments are complete but not yet validated
    console.log(`Tool completed: ${event.toolCall.name}`, event.toolCall.arguments);
  }
}
```

**Important**: During `toolcall_delta`, `arguments` contains best-effort parsed partial JSON. Fields may be missing or incomplete. At minimum, `arguments` will be `{}`, never `undefined`.

### 2. Validate Arguments

```typescript
import { validateToolCall } from "@tsuuanmi/pi-ai";

for await (const event of stream(model, context)) {
  if (event.type === "toolcall_end") {
    try {
      const validatedArgs = validateToolCall(tools, event.toolCall);
      const result = await executeMyTool(event.toolCall.name, validatedArgs);
      context.messages.push({
        role: "toolResult",
        toolCallId: event.toolCall.id,
        toolName: event.toolCall.name,
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError: false,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Validation failed — return error to model for retry
      context.messages.push({
        role: "toolResult",
        toolCallId: event.toolCall.id,
        toolName: event.toolCall.name,
        content: [{ type: "text", text: error.message }],
        isError: true,
        timestamp: Date.now(),
      });
    }
  }
}
```

### 3. Continue After Tool Results

```typescript
// After adding tool results to context
const continuation = await complete(model, context);
```

## Tool Interface

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: TSchema; // TypeBox schema
}
```

The `parameters` field is a TypeBox schema object. Use `Type.Object()` for the top level, with `Type.String()`, `Type.Number()`, `Type.Array()`, `Type.Boolean()`, `StringEnum()`, and nested `Type.Object()` for parameters.

## Error Handling

When a tool fails, throw an error from `execute()`. The error is caught and reported to the LLM as a tool error with `isError: true`:

```typescript
try {
  const validatedArgs = validateToolCall(tools, toolCall);
  // Execute the tool
} catch (error) {
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

## TypeBox Re-exports

The package re-exports `Type`, `Static`, and `TSchema` from TypeBox:

```typescript
import { Type, type Static, type TSchema } from "@tsuuanmi/pi-ai";
```

This allows defining tool schemas without adding TypeBox as a direct dependency.