# tools/compact

Mirrors `src/tools/compact.ts`.

Registers `internet_compact` — compacts ChatGPT Web conversation history through the local daemon.
Parameters: optional `account`, required `model`, required `input` array, and optional `instructions`.

If `model` is the Luna model (`isLunaModel`), the tool throws because Luna uses rolling checkpoints
and separate compaction is disabled. Otherwise it calls `DaemonClient.compact` and returns the
resulting `output` as text and the full response as `details`.
