# backends/openai/turn/request

Mirrors `src/backends/openai/turn/request.ts`.

Pure daemon identity/environment payload adaptation. This module has no I/O; it rewrites the
serialized request so the daemon's browser replay keeps a stable thread/turn identity.

## `ChatGptWebRequestContext`

```ts
interface ChatGptWebRequestContext {
  cwd: string;
  sessionId: string;
  turnId: string;
}
```

## `rejectedChatGptWebRequest`

```ts
rejectedChatGptWebRequest(): Record<string, unknown>
```

Returns a fixed, content-free request using the reserved unknown local route
`chatgpt-web/__request-rejected__` with empty input. Used by the hook to block a request without
forwarding the original payload (a reachable daemon rejects the unknown route with HTTP 400).

## `adaptChatGptWebRequest`

```ts
adaptChatGptWebRequest(payload, context): unknown
```

Validates the payload (an object with an `input` array), the session/turn identity, and an
absolute, XML-safe `cwd` (no `<>`/control characters). Then:

- Computes a stable `thread_id` from `sessionId` and a stable `turn_id` from
  `sessionId \0 turnId` (sha256, first 32 hex chars).
- Normalizes `input`, removing a previously generated environment/user pair when it matches what
  this function would produce (so re-adaptation stays idempotent).
- Splices in an `<environment_context>` message (read-only sandbox, network enabled, the `cwd`) and
  a canonical user message carrying a stable user id.
- Sets `prompt_cache_key` to the thread id and adds `client_metadata.x-codex-turn-metadata` with the
  thread/turn ids, sandbox, and workspace (`git: null`) JSON.

Invalid payloads raise `InternetError` with code `daemon_rejected`.

## `environmentMessage`

The injected user message text:

```text
<environment_context>
  <cwd>...</cwd>
  <sandbox_mode>read-only</sandbox_mode>
  <network_access>enabled</network_access>
</environment_context>
```
