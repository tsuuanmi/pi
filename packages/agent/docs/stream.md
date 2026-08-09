# Stream Function Contract

`src/stream.ts` defines the `StreamFunction` contract used by `Agent` to call the provider.

A stream function receives a Pi AI model, request context, and optional stream options. It returns an `AssistantMessageEventStream` directly or through a promise. The agent uses the built-in `stream` function from `@tsuuanmi/pi-ai` unless an `AgentOptions.stream` implementation is provided.

Use `stream` for custom stream injection.
