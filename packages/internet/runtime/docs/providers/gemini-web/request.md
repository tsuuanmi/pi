# providers/gemini-web/request

Mirrors `src/providers/gemini-web/request.ts`.

Parses the supported text-only Responses subset, ignores attached tool declarations and tool choice, maps a non-off reasoning effort to Extended thinking, rejects unsupported content and controls, and requires `metadata.pi_caller.session_id` as the one-to-one native Gemini chat key.
