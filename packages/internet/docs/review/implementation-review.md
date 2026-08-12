# Internet — Implementation Review

Review-only assessment of the `@tsuuanmi/pi-internet` implementation. No code was changed as part
of this review.

## Overall

The implementation is clean, well-structured, and consistent with the monorepo conventions. Module
boundaries are clear, the tool host/spec pattern mirrors `workflows`, the account registry is atomic
and private, and the test suite (21 tests / 15 files) plus build, Biome, and root typecheck all pass.
The decision to route through Pi's native `openai-responses` transport and drop the custom
SSE/replay scaffolding is correct and well-documented.

One substantive correctness issue (model metadata) and several smaller consistency/dead-code items
were found. None are blocking, but the model metadata issue is worth fixing.

---

## 1. Model metadata does not match the daemon's route semantics (most significant)

`src/backends/openai/models.ts` names `chatgpt-web/high` as "GPT-5.6 Sol" and `chatgpt-web/luna` as
"GPT-5.6 Luna", and gives both multi-level `thinkingLevelMap`s. The daemon source
(`codex-chatgpt-web/src/chatgpt-web-models.ts`) contradicts this:

- `chatgpt-web/high` is **"ChatGPT Web — High"**, a Codex effort route with `codexEffort: "high"`,
  `adapterEffort: "high"`, `requiresPro: false`. It is **not** a distinct "Sol" model.
- `chatgpt-web/luna` is a single `low`-effort route.
- The daemon comment states: *"every routed model advertises exactly one immutable protocol effort."*

So the package's `thinkingLevelMap` advertising `low/medium/high/xhigh` (Sol) and
`low/medium/high/xhigh/max` (Luna) would cause Pi to send reasoning-effort values the daemon route
does not accept. The names are also misleading relative to the daemon's route catalog (which also
includes `light`, `medium`, `extra-high`, and `pro`).

**Recommendation:** Either (a) align each model to the daemon's single immutable effort (e.g.
`chatgpt-web/high` → only `high`, `chatgpt-web/luna` → only `low`) and rename to the daemon's display
names, or (b) if the intent is to expose the full route set, add the missing routes. The current
"Sol/Luna" naming and multi-level maps are not faithful to the daemon.

---

## 2. `maxTokens` values are speculative

`maxTokens: 90_000` (high) and `128_000` (Luna) are not sourced from the daemon (the daemon routes
define no max-token field). The context windows (90k / 1.05M) do match the daemon constants, but
`maxTokens` is invented. Worth either sourcing from a real value or documenting as an estimate.

---

## 3. `providerName()` is inconsistent with registration behavior

- `registerOpenAiProviders` gives the canonical `chatgpt-web` name only when there is exactly
  **one** enabled account.
- The standalone `providerName(account)` (no primary arg) always returns `chatgpt-web-<id>`.

The test asserts the standalone form, so the two paths disagree. More importantly, the canonical
name is **unstable**: with two accounts both get suffixed names, and if one is later disabled the
survivor stays suffixed rather than becoming canonical. This is a confusing public API. Consider
making the naming rule explicit and stable (e.g. always suffix, or always canonical for the first
account).

---

## 4. Dead code / unused exports

- `src/core/errors.ts`: `"request_failed"` in `InternetErrorCode` is never used anywhere.
- `src/hooks.ts`: `export type InternetHookContext = ExtensionContext` is exported but never
  imported/used.
- `src/core/types.ts`: `InternetContext.cwd` is populated in `extension.ts` but no tool reads
  `context` at all (all tools ignore the context argument). The `InternetContext` indirection is
  currently inert — every tool signature takes `context` but never uses it. This is a "seam without
  a consumer" that the implementation task explicitly asked to avoid.

---

## 5. Minor test-quality notes

- `test/backends/openai/daemon/client.test.ts` uses `controlToken: "secret"` (7 chars) directly in
  the `config` object, bypassing `readDaemonConfig`'s 40-char validation. That is fine for the unit
  test (it tests the client, not auth), but it is inconsistent with the auth test's 40-char token and
  could mask a regression if the client ever re-validates.
- `test/tools/status.test.ts` and others use `{ id: "default" } as never` for the mocked account —
  works, but `as never` is a weak cast that would hide shape drift.

---

## 6. Docs are accurate and well-maintained

The README, architecture, layout, how-it-works, pi-integration, and implementation-phases docs all
match the implemented code and correctly describe the deferred work. The changelog is consistent. No
stale `runtime.json`/scaffold references remain except in clearly-labeled historical/future
contexts.

---

## Summary

- **Correctness:** model metadata (names + thinking maps) should be aligned to the daemon's
  single-immutable-effort route semantics; `maxTokens` should be sourced or documented.
- **Consistency:** `providerName` naming rule should be made stable and consistent between the
  standalone function and registration.
- **Cleanliness:** remove the unused `request_failed` code, unused `InternetHookContext` export, and
  either use `InternetContext` or drop the indirection.

No code was changed during this review.
