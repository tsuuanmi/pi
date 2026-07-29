# schema/schema-validator

Mirrors `src/schema/schema-validator.ts`.

## Exports

- `StringEnum(values, options?)` creates a provider-compatible string enum schema without `anyOf`/`const` patterns.
- `formatTypeBoxValidationPath(error)` formats TypeBox validation paths for user-facing errors.
- `validateToolCall(tools, toolCall)` finds a tool by name and validates a provider tool call.
- `validateToolArguments(tool, toolCall)` validates and returns converted/coerced arguments.

## Validation behavior

Validation uses TypeBox `Compile()` and caches validators by schema object identity. Arguments are cloned before conversion.

For TypeBox schemas, `Value.Convert()` handles common conversions. For plain JSON Schema-like objects without TypeBox metadata, the validator additionally coerces primitive values and recursively applies object, array, `allOf`, `anyOf`, and `oneOf` coercion when safe.

Validation errors include the tool name, formatted field paths, TypeBox messages, and the received arguments JSON.
