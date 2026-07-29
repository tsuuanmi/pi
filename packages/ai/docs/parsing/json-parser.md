# parsing/json-parser

Mirrors `src/parsing/json-parser.ts`.

## Exports

- `sanitizeSurrogates(text)` removes unpaired Unicode surrogate characters that can break JSON serialization while preserving valid paired-surrogate characters such as emoji.
- `repairJson(json)` repairs malformed JSON string literals by escaping raw control characters and preserving/doubling backslashes around invalid escapes.
- `parseJsonWithRepair<T>(json)` tries `JSON.parse()` first, then tries parsing a repaired string.
- `parseStreamingJson<T>(partialJson)` parses partial or malformed streaming JSON and returns `{}` when no safe parse is available.

`parseStreamingJson()` is used while tool-call arguments are still streaming so partial JSON can be shown and updated incrementally.
