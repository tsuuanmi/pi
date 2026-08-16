# tools/compact

Mirrors `src/tools/compact.ts`.

Registers `internet_compact` — compacts ChatGPT Web conversation history through the local daemon.
Parameters: optional `account`, required `model`, required `input` array, and optional `instructions`.

The tool resolves the provider-local or canonical Sol model id, calls `DaemonClient.compact`, and
returns the resulting `output` as text and the full response as `details`.
