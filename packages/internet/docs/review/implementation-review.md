# Internet — Implementation Review

This review records findings from the original provider/client MVP and their disposition after the
package-owned daemon implementation.

## Current status

The package now vendors a fixed codex-chatgpt-web snapshot, builds its embedded-Bun Linux runtime,
owns isolated login/start/stop lifecycle, and retains Pi's built-in `openai-responses` transport.
Build, package tests, Biome, and root typecheck pass.

## Deferred: model metadata does not match daemon route semantics

`src/backends/openai/models.ts` names `chatgpt-web/high` as "GPT-5.6 Sol" and
`chatgpt-web/luna` as "GPT-5.6 Luna", with multi-level thinking maps. The vendored daemon's route
catalog defines immutable efforts: `high` is a high-effort Codex route and `luna` is low-effort.
The current names/maps may therefore send unsupported reasoning efforts.

This correction is explicitly out of scope for the owned-daemon phase and remains the next
correctness task. Either expose each route's one immutable effort and daemon display name, or expose
the complete route set with faithful metadata.

## Deferred: speculative `maxTokens`

The current 90,000/128,000 `maxTokens` values are not sourced from the daemon. Context windows are
sourced, but output limits should be sourced or clearly documented when model metadata is corrected.

## Resolved: stable provider names

The provider name is now account-based and stable: account `default` is `chatgpt-web`; every other
account is `chatgpt-web-<account-id>`. Enabling/disabling unrelated accounts does not rename an
existing provider.

## Resolved: dead abstractions and code

Removed:

- unused `request_failed` error code;
- unused `InternetHookContext` export;
- unused reduced `InternetContext` and custom tool host/spec adapter;
- stale public `./tool` export.

Tools now use Pi's current extension tool contract directly.

## Remaining test-quality notes

Some focused unit tests still use narrow unsafe casts for partial host/account mocks. These do not
affect production boundaries but can be tightened independently. The daemon client test's short
literal token bypasses config validation intentionally because that test targets HTTP behavior.
