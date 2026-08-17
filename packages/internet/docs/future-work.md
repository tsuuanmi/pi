# Future Work

This page records features that were designed or brainstormed but are **not yet implemented**. The
current authoritative behavior is the source and the mirrored module references under
[`index.md`](index.md). Items here are proposals, not commitments.

## Response acknowledgement / replay recovery

A completed browser response can outrun Pi's persistence: ChatGPT completes the turn and the journal
records the assistant digest, but Pi is interrupted before it writes the assistant response. On
resume, Pi lacks that response while the bound ChatGPT conversation already contains it. This is
local synchronization protection, not a ChatGPT upstream outage, and it is independent of browser
lifetime.

A completed browser response should first enter an `awaiting_client_ack` state rather than being
assumed present in Pi history:

```text
ChatGPT completes response
          |
          v
Persist response events/text + digest + originating turn identity
          |
          v
awaiting_client_ack
          |
          +-- next history contains response ------> acknowledge; continue normally
          |
          +-- exact request is retried ------------> replay stored response; do not resubmit
          |
          +-- unchanged prefix + new user turn ----> accept a delivery gap; continue in C
          |
          +-- earlier prefix/authority/ID changed -> genuine conflict; fail closed
```

Replay data must use the journal's existing private, atomic storage boundary and be removed after
acknowledgement. This preserves one ChatGPT conversation per Pi session while retaining strict
protection against rewinds, edited history, changed authority, and conversation-ID replacement.

## Fusion "ask all"

Fan a single query across all enabled providers and synthesize one coherent answer with attribution,
rather than a side-by-side comparison.

- `internet_ask_all(query)` fans out to every enabled provider in parallel, collects the answers,
  and returns `{ fused, sources, disagreements }`.
- Synthesis options: heuristic merge (free, fast, no extra model call) first; strongest-provider
  synthesis as an opt-in for higher quality.
- Rationale: ensemble reasoning reduces hallucination, returns one answer instead of N to reconcile,
  and preserves attribution.
- Open questions: where fusion runs (package vs. daemon — prefer the package so it works across
  providers), concurrency/rate-limit caps, and attribution accuracy.

## `internet_browse`

Drive the daemon's browser to a URL and return the rendered content, for JavaScript-heavy pages that
`internet_fetch` cannot read. Heavier than the bounded read-only `internet_fetch`; deferred.

## Guided multi-account login

A `login` flow that walks the user through every enabled account in one pass, so setting up a
multi-account team is one guided pass rather than N separate discoveries. Sign-in itself remains
one-time manual per account with session reuse.

## Session export

Allow exporting a signed-in session (storage-state file) for reuse across setups, complementing the
existing storage-state import path.

## TOTP-assisted sign-in automation

Opt-in, best-effort automation for plain email/password + TOTP accounts only (`account|password|totp-secret`).
It fills the form, computes the current TOTP code, and captures the session. It is not a default and
still risks Cloudflare challenges. Raw `account|password|2fa` automation, plaintext credential
storage, and push/SSO automation are explicitly out of scope.

## Model aliases and smart routing

Optional ideas from the Prometheus comparison: model aliases and smart routing
(`ask_all_ais`, `compare_ais`, `smart_query`). Not planned until the multi-provider seam and fusion
contract are finalized.
