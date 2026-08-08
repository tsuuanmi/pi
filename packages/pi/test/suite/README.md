# Coding agent suite tests

Use `test/suite/` for the new harness-based test suite around `AgentSession` and `AgentSessionRuntime`.

Rules:
- Use `test/suite/harness.ts`
- Use the test provider helper from `packages/pi/test/helpers/provider.ts`
- Do not use real provider APIs, real API keys, network calls, or paid tokens
- Keep these tests CI-safe and deterministic
- Use `test/helpers/unit-harness.ts` only when the suite harness lacks a required capability

Organization:
- Put broad lifecycle and characterization tests directly under `test/suite/`
- Put issue-specific regression tests under `test/suite/regressions/`
- Name regression tests as `<issue-number>-<short-slug>.test.ts`
- Example: `test/suite/regressions/2023-queued-slash-command-followup.test.ts`
