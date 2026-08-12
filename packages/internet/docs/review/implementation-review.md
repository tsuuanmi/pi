# Internet — Implementation Review

This review records findings from the original provider/client MVP and their disposition after the
package-owned daemon implementation.

## Current status

The package now vendors a fixed codex-chatgpt-web snapshot, builds its embedded-Bun Linux runtime,
owns isolated login/start/stop lifecycle, and retains Pi's built-in `openai-responses` transport.
Model metadata, automatic-login settings, and read-only web access are implemented. The current
verification status is recorded with each implementation change.

## Resolved: fixed-effort model metadata

The package now exposes separate daemon route models with daemon display names and exactly one
supported Pi thinking level each. Luna is mutually exclusive with Sol; Extra High and Pro are
capability-gated. Route context windows come from the daemon catalog.

The daemon does not define a model output-token ceiling: its auto-compaction, browser-message, and
composer limits have different meanings. `maxTokens` therefore uses a documented conservative
16,384 output ceiling rather than the previous speculative context-derived values.

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
