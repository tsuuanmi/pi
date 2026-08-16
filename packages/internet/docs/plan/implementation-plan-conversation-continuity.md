# Internet — Implementation Plan: Durable Conversation Continuity

This plan defines the durable ChatGPT Web architecture. There is no alternate per-turn conversation
mode.

## Source-grounded design

Each Pi session maps to one ChatGPT conversation:

```text
Pi session S -> private conversation journal -> ChatGPT conversation C
                                      |
                              ephemeral browser process
```

The journal persists the canonical conversation ID/URL and the last acknowledged history
checkpoint. Browser or daemon idle shutdown closes only the ephemeral browser process. A later turn
restarts the browser, opens the saved URL, validates the checkpoint, and continues C.

A new Pi session gets a new ChatGPT conversation. Resetting the conversation state is an explicit
operation through `internet_conversation { action: "reset", confirm: true }`.

## Turn flow

1. Pi sends the normalized request with stable session and turn metadata.
2. The adapter canonicalizes Pi history and compares it with the journal checkpoint.
3. The first turn creates C and sends the relevant initial context.
4. A continuation sends the new history suffix, current environment, tool results, and the small
   bridge contract. Earlier messages remain in C and are not replayed during normal continuation.
5. ChatGPT responds in C. The adapter records the response checkpoint and returns the result to Pi.
6. If the browser is idle for approximately one minute, the daemon closes it without deleting the
   journal or ChatGPT binding.

## Full mode

Full/local-tool mode uses the same durable conversation path. The broker remains responsible for
registering and validating `codex_*` tool calls; durable conversation handling is independent of
whether local tools are enabled. Tool-result rounds reuse the active browser turn and later
completed turns update the same journal checkpoint.

## Safety invariants

- Conversation IDs are immutable after the first successful turn.
- Account storage state and conversation journals remain owner-private.
- Rewinds, edited prefixes, changed authority, and changed conversation IDs fail closed.
- ChatGPT image attachments are rejected until durable attachment synchronization is implemented.
- A completed response that Pi did not persist requires explicit acknowledgement/replay recovery; it
  must not silently create a second conversation or submit a duplicate turn.

## Verification

- Build the package and embedded runtime.
- Run focused journal, suffix, provider, browser-worker, and tool tests.
- Run the affected package test suite.
- Live verify multiple turns, browser restart, Full-mode tool rounds, reset, and separate-session
  isolation.
