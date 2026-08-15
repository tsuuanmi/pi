# Internet — Implementation Review

This review records the final disposition of the provider/client MVP and the completed cross-platform,
provider-neutral implementation.

## Runtime and browser boundary

The package vendors one fixed `codex-chatgpt-web` snapshot and compiles a native self-contained
runtime for Linux or macOS on x64/arm64. Runtime manifests are host-matched and launcher paths are
contained/executable. Owned config chooses platform Chrome defaults; Chrome remains the only host
browser dependency.

Each ChatGPT account owns its config, auth state, loopback endpoint, serialized lifecycle, and
optional Full-mode tunnel. Daemon modules accept only the narrowed ChatGPT account type.

## Response and login reliability

The browser worker now uses authenticated conversation wire payloads as the primary final-response
source and logs capture provenance. The reviewed DOM parser remains the specified compatibility
fallback because upstream wire shapes can vary.

Interactive owned-profile login remains authoritative. Optional Playwright storage-state import is
bounded, rejects symlinks/non-files, filters unrelated domains, verifies in daemon-owned Chrome, and
persists only after verification. No password/2FA collection path exists.

## Provider-neutral accounts

Schema-2 account metadata is a discriminated union:

- `openai` owns ChatGPT Web daemon configuration.
- `anthropic` owns an Anthropic API-key environment reference.
- `google` owns a Gemini API-key environment reference.

The generic provider registry is the only provider composition path. Stable account-derived provider
names are shared with council model allowlisting. API secret values never enter account files or tool
output.

## Model and orchestration surfaces

ChatGPT route metadata remains capability-scoped. Anthropic uses Pi's native messages transport and
package-aligned model metadata. Gemini uses Google's documented OpenAI-compatible endpoint with
explicit Flash/Pro mappings.

`CouncilService` composes 2–6 enabled internet models through `@tsuuanmi/pi-orchestrator`. Members are
tool-free, single-turn, output-capped agents; the chair runs only after dependency outputs are ready.
Concurrency, task starts, retries, wall-clock duration, provider scope, and cancellation are bounded.

## Removed or superseded surfaces

- Account registry schema 1 and optional/default provider creation semantics.
- Direct package-root `registerOpenAiProviders` export; generic provider registration is authoritative.
- Daemon operations on the undifferentiated account union.
- Linux-only runtime rejection.
- Add/enable-only account lifecycle; removal is now explicit.

No compatibility aliases, migration readers, duplicate provider registries, alternate tool bridges,
or unowned browser automation paths remain.

## Verification boundary

Automated verification covers package build/pack, runtime resolution, login-state filtering, wire
parsing, provider configs, account lifecycle, councils, daemon behavior, public web safety, root
typecheck, and formatting/lint. Credential-dependent browser/API/Full-mode smoke tests require a
release environment with operator-owned accounts and are not replaced by mocks or fallback
providers.
