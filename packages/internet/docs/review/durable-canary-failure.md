# Internet — Review: Durable Conversation Authority and Continuity

This review records the resolved causes of
`invalid_request_error: Durable ChatGPT conversation authority is invalid or stale` and the related
multi-turn continuity failure found during live verification on 2026-08-14.

Status: **resolved and live-verified**. Companion to
`docs/plan/implementation-plan-conversation-continuity.md` and
`docs/review/implementation-review.md`.

---

## 1. Reported failures

The durable-conversation path exhibited three user-visible failures:

1. The authority canary remained `in_progress`, so durable requests failed with:

   ```text
   Error: invalid_request_error: Durable ChatGPT conversation authority is invalid or stale
   ```

2. A canary could create and reopen a real ChatGPT conversation but still fail because the model's
   reply was not exactly `PI_DURABLE_CONVERSATION_CANARY_OK`.
3. A resumed Pi session failed with `Pi conversation history diverged from the bound ChatGPT
   conversation`, leaving only the first turn in the ChatGPT conversation.

Model selection also rendered redundant identifiers such as
`chatgpt-web/chatgpt-web/high` because provider model ids repeated the provider namespace.

---

## 2. Root causes and resolutions

### 2.1 Canary request timeout

`conversationCanaryExclusive()` drives a complete browser turn and reopen verification. Observed
runs took approximately 10–15 seconds, but `DaemonClient` applied its shared 5-second HTTP timeout.
The client aborted the browser turn, and `authority.json` remained `status: "in_progress"`.

**Resolution:** `DaemonClient.conversationCanary()` now uses a dedicated 120-second timeout while
all ordinary daemon requests retain the 5-second default. Caller cancellation still propagates
through the supplied `AbortSignal`.

### 2.2 Fragile exact model-reply assertion

The canary required:

```ts
response.trim() === "PI_DURABLE_CONVERSATION_CANARY_OK"
```

Live Sol replies contained the marker plus surrounding text (observed completed replies were 46 and
75 characters). Those turns had valid canonical ChatGPT conversation URLs and completed reopen
verification, but the strict wording assertion rejected them.

**Resolution:** the browser canary protocol is isolated in `conversation-canary.ts`. It requires a
non-empty completed reply and a canonical `https://chatgpt.com/c/<id>` URL. The existing close,
reopen, and authenticated-surface preparation remains the authoritative durability check. Model
wording is no longer treated as a storage invariant.

### 2.3 Generated environment messages polluted the stable history prefix

Pi inserts a generated `<environment_context>` user message immediately before each active user
turn. The Responses parser does not preserve the original `environment_*` item id, but durable
canonicalization identified generated environment messages only by that id.

The first checkpoint therefore persisted:

```text
developer, environment(turn 1), user(turn 1)
```

On resume, the same generated environment message moved with the active turn:

```text
developer, user(turn 1), assistant(turn 1), environment(turn 2), user(turn 2)
```

The prefix comparison correctly rejected this apparent reorder, so the second turn never reached
ChatGPT.

**Resolution:** one shared `isGeneratedEnvironmentMessage()` classifier now recognizes both raw
`environment_*` ids and parsed `<environment_context>...</environment_context>` content. Canonical
history excludes those request-only messages while retaining original source indexes, allowing the
prompt compiler to include the current environment block without treating it as persistent chat
history.

### 2.4 Multi-phase assistant responses failed on the next turn

A ChatGPT response may persist as consecutive assistant messages: commentary, zero-text reasoning
parts, then the final answer. The checkpoint stores the browser's final answer, but continuation
previously compared that digest with only the first assistant event. A two-phase second response
therefore caused the third request to fail as divergent even though the ChatGPT conversation was
correct.

**Resolution:** synchronization now acknowledges a consecutive assistant phase group as one browser
response. It validates the last non-empty assistant text (the final answer) and starts the next-turn
suffix after the entire group. Earlier prefix edits and changed final answers remain fail-closed.

### 2.5 Session-to-conversation identity was not immutable

`ConversationJournal.markReady()` previously allowed a continuation to replace an established
`conversationId` with a different ChatGPT URL.

**Resolution:** once a thread binding has a conversation id, later turns must acknowledge the same
id. Any identity change marks the turn as failed instead of silently rebinding the Pi session.

### 2.6 Provider model ids repeated the provider namespace

The provider name is already `chatgpt-web`, but exposed model ids were `chatgpt-web/high`,
`chatgpt-web/light`, and so on. Pi combines provider and model id for display, producing names such
as `chatgpt-web/chatgpt-web/high`.

**Resolution:** provider metadata now exposes local ids (`light`, `medium`, `high`, `extra-high`,
`pro`, `luna`). Request adaptation maps each local id to the daemon's canonical
`chatgpt-web/<id>` route. The display is now `chatgpt-web/high`; no legacy provider-model aliases are
published.

---

## 3. Automated verification

Focused coverage now proves:

- health calls retain the 5-second timeout and canary calls use 120 seconds;
- canary replies may contain surrounding model text but may not be empty;
- canary URLs must be canonical ChatGPT conversation URLs;
- generated environment blocks are excluded even after parser ids are removed and may move between
  turns without changing the persistent prefix;
- commentary, reasoning-only, and final-answer assistant phases are acknowledged as one response;
- retries, authority changes, rewinds, edited prefixes, and changed final assistant output remain
  fail-closed;
- a durable thread preserves one conversation id across multiple journal transitions and rejects a
  replacement id;
- provider-local model ids map to exactly one canonical daemon route.

The full package test suite passes: **35 files, 117 tests**.

---

## 4. Live verification

After rebuilding and restarting the package-owned daemon:

1. `POST /admin/conversation-canary` returned `{ "status": "passed" }`.
2. `authority.json` transitioned to `status: "passed"` with a canonical canary conversation id.
3. A persistent Pi researcher session was asked to remember `violet-936`.
4. The same session was resumed and returned `violet-936`.
5. Its journal remained `status: "ready"` on one ChatGPT conversation id,
   `6a7ee7ae-3ba4-83ec-835e-64342cb639d3`, and advanced to revision 9 after three completed turns.
6. The reported third-turn failure was traced to a persisted second response containing commentary,
   reasoning-only parts, and a final answer; that exact event shape is covered by the synchronization
   regression test.

This verifies the required topology: **one Pi session maps to one stable ChatGPT conversation id
across turns**, including multi-phase assistant output.

---

## 5. Result

The durable authority gate now reaches `passed`, the reported stale-authority error is resolved, and
multi-turn continuation reaches the same ChatGPT chat. The implementation keeps strict validation
where it represents durable identity or history integrity and removes strictness only where it was
incorrectly coupled to nondeterministic model wording or request-only environment metadata.
