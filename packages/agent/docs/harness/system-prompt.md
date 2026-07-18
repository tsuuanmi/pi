# System Prompt

System-prompt skill formatting is no longer implemented or exported from `packages/agent/src`.

The current package supports system prompts through `AgentState.systemPrompt`, `AgentOptions.initialState.systemPrompt`, and the `before_agent_start` extension event documented in [Extension Contract](extension-contract.md). Higher-layer hosts own skill-specific prompt assembly.
