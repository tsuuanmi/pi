# providers/gemini-web/prompt

Mirrors `src/providers/gemini-web/prompt.ts`.

Ignores tool declarations that Pi attaches automatically, rejects tool-result history, images/files, structured output, and opaque payloads before browser acquisition, and allows the parsed single reasoning option. It compiles normalized history for a new native chat and only the current user text for an existing chat.
