# Internet — Implemented Plan (R1 + R2 + R3)

Implemented scope for **R1 model metadata**, **R2 `autoLogin` opt-out**, and **R3
`internet_search` + `internet_fetch`**. The original proposal was reviewed against current package,
Pi hook, and vendored daemon source before implementation; source-derived corrections are recorded
below.

> Status: **implemented.** R4–R7 remain in `roi-roadmap.md`.

## Review corrections

1. Luna is mutually exclusive with Sol (`availableChatGptWebModelRoutes`); it is not advertised
   alongside Sol routes. Pro routes require cached `proAvailable:true`.
2. Daemon context, auto-compaction, browser-message, and composer limits are not model output-token
   limits. `maxTokens` therefore uses a documented conservative `16_384` ceiling rather than
   mislabeling transport values.
3. `/v1/alpha/search` forwards the caller's native Codex Bearer token upstream. The browser-only
   package does not own that credential, and its admin control token must never be forwarded. The
   vendored synthetic sidecar stores configuration but has no executor. Search therefore uses an
   explicit keyless public-web transport, not either incomplete daemon path.
4. Pi's `before_provider_request` dispatcher records and swallows hook exceptions; it does not expose
   request cancellation. With `autoLogin:false`, the hook suppresses Chrome and notifies interactive
   users. The provider remains the authoritative failure until explicit login.

---

## R1 — Fixed-effort, capability-scoped models

### Implementation

- `src/backends/openai/turn/model.ts` is the authoritative package route catalog:
  `light`, `medium`, `high`, `extra-high`, `pro`, and `luna`, with daemon display names, immutable
  Pi reasoning levels, context windows, capability requirements, and conservative output limits.
- `src/backends/openai/models.ts` converts routes to `ProviderModelConfig`. Every thinking level is
  explicitly `null` except the route's single supported level.
- `src/daemon/config.ts` reads cached `solAvailable`/`proAvailable` from the private owned config;
  before config exists it matches the daemon's default Sol/non-Pro capability.
- `src/backends/openai/provider.ts` constructs models per account at startup:
  - Luna-only account → Luna.
  - Sol account → Instant, Medium, High.
  - Sol Pro account → Instant, Medium, High, Extra High, Pro.
- Provider registration is async because capability reads are filesystem I/O. Capability changes
  after login take effect after Pi reload, consistent with startup-scoped provider registration.

### Acceptance coverage

- Route IDs and removed legacy alias behavior.
- Exactly one supported thinking level per model.
- Context windows and conservative output ceiling.
- Luna/Sol exclusivity and Pro gating.
- Provider model list derived from owned config.

---

## R2 — Explicit automatic-login setting

### Implementation

- `src/settings.ts` owns `$PI_AGENT_DIR/internet/settings.json` with atomic `0600` writes.
- Default: `{ "autoLogin": true }`.
- `internet_settings` reads settings or updates `autoLogin`.
- The readiness hook checks the setting only when verified login is absent:
  - true → existing login/start readiness behavior.
  - false → no Chrome launch; interactive notification instructs `internet_daemon login`.
- Explicit `internet_daemon login` remains unchanged and approval-gated.

### Acceptance coverage

- Default, private persistence, and toggle behavior.
- No `ensureReady` call when login is absent and `autoLogin:false`.
- Actionable interactive notification.

---

## R3 — Read-only public web tools

### Implementation

- `src/web/fetch.ts` is the shared public HTTP boundary:
  - HTTP/HTTPS only; URL credentials rejected.
  - DNS-resolved private, loopback, link-local, carrier-grade NAT, multicast, and reserved
    destinations rejected.
  - Every redirect target is revalidated.
  - Timeout, redirect count, content type, content length, and actual body size are bounded.
  - Text, HTML, JSON, XML, and XHTML are accepted; HTML is reduced to readable text.
- `src/web/search.ts` queries a keyless public RSS search endpoint and returns bounded
  `{ title, url, snippet }` records.
- `src/tools/web.ts` exposes `internet_search` and `internet_fetch`.
- Both are read-only and are not included in the destructive approval hook.
- `DaemonClient` remains cohesive: daemon HTTP only, with no unrelated external fetch method.

### Acceptance coverage

- RSS parsing and result limits.
- Readable HTML extraction.
- Private initial/redirect destination rejection.
- Binary and oversized response rejection.
- Tool registration and result shape.

---

## Out of scope

- R4 `internet_doctor`.
- R5 hybrid network/DOM capture.
- R6 multi-backend/fusion.
- R7 native tool bridge.
- Non-Linux runtime artifacts.

## Verification gate

- `npm run build`.
- `npm test`.
- `npx biome check --write --error-on-warnings packages/internet`.
- `npx tsgo --noEmit` from repository root.
- `git diff --check -- packages/internet`.
- `npm pack --dry-run --ignore-scripts`.
