# Tool Calls

`src/tool-call.ts` defines `ToolCall`, the model-produced tool-call content shape used by loop execution and pruning.

Host-owned executable tools are defined separately under `src/tool/`; this type represents the assistant message request to invoke one.
