# providers/gemini-web/conversation/policy

Mirrors `src/providers/gemini-web/conversation/policy.ts`.

Persists one private atomic state file per hashed Pi session ID; raw session IDs are not written. The first successful turn binds that session to one safe native Gemini chat URL, and later URL changes are rejected.
