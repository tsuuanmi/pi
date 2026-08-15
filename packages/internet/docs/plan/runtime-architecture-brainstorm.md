# Internet — Runtime Architecture Brainstorm

This document brainstorms the **best runtime architecture** for the `internet` package, grounded in
the actual constraints of the three source repos and the implemented package. It is a design
brainstorm, not a settled spec: it lays out the options, the tradeoffs, and a recommended target.

> Status: **decided + direction.** The runtime decision is **use the current runtime**: vendor the
> daemon and embed Bun as an isolated child process. This document states that decision, gives the
> canonical reason, and covers the target architecture as the package grows (macOS, hybrid capture,
> backends, Council).

---

## 1. The core constraint: the daemon is a Bun application

The vendored `codex-chatgpt-web` daemon is written for **Bun**, not Node. It uses Bun-specific
APIs throughout:

- `Bun.serve` (HTTP server)
- `Bun.zstdDecompress` (SSE/compaction)
- `Bun.main` (entrypoint)
- `Bun.which` (binary resolution)
- `Bun.file` / `Bun.write` (filesystem)

This is the single most important fact for the runtime decision. It means the daemon **cannot run as
plain Node** without a porting effort that touches the highest-risk code (browser automation, SSE,
compaction).

---

## 2. The options

### Option A — Vendor + embed Bun, spawn as child process (current)

The package vendors the daemon source, builds it with Bun into a self-contained runtime
(`dist/daemon/runtime/`), and spawns it as a child process.

```
Pi process (Node)
  └─ spawn ─► embedded Bun runtime (codex-chatgpt-web daemon)
                 └─ Playwright ─► system Chrome
```

- **Pros:** reuses all mature daemon behavior; self-contained; no second repo at runtime; the
  package stays a thin client.
- **Cons:** ~184MB platform-specific artifact; build requires Bun; fixed snapshot (no upstream sync);
  one artifact per platform/arch.

### Option B — Port the daemon to Node

Rewrite the Bun-specific calls (`Bun.serve` → `node:http`, `Bun.zstdDecompress` → `zstd` lib, etc.)
so the daemon runs as plain Node in-process.

- **Pros:** no embedded Bun; smaller footprint; single process.
- **Cons:** high-risk behavior drift in the browser/session/SSE path; large effort; the daemon is
  actively maintained upstream, so a fork diverges. **Rejected** — the risk/effort is not worth it.

### Option C — Run the daemon as a separate installed service

Install the daemon as a system service (launchd/systemd) and have the package connect over HTTP.

- **Pros:** decouples lifecycle; daemon survives Pi restarts.
- **Cons:** loses package-owned lifecycle (login/start/stop/health-gating); harder to isolate per
  account; more moving parts. **Rejected** for the current model, which wants package-owned,
  per-account, health-gated lifecycle.

### Option D — Reimplement browser automation natively in the package

Write a fresh Playwright/Chrome driver in the package.

- **Pros:** full control; no vendored dependency.
- **Cons:** by far the largest scope (login, session, replay, compaction, SSE, concurrency); throws
  away the daemon's hard-won behavior. **Rejected.**

---

## 3. Recommendation: Option A is correct, with refinements

**Option A (vendor + embed Bun, child process) is the best design** and should remain the baseline.
The refinements below are the actual "best architecture" work.

### 3.0 The runtime boundary is explicit and isolated

A core requirement is a **clear, explicit boundary** between the Pi process and the daemon runtime,
with the runtime **isolated** from the Pi process. The child-process model gives this for free:

- **Process boundary.** The daemon runs in its own OS process (embedded Bun), not in the Pi Node
  process. A daemon crash, a browser hang, or a memory leak cannot take down Pi.
- **Failure isolation.** The package can kill, restart, or drain the daemon independently of Pi.
  A stuck browser turn is contained to the daemon.
- **Credential isolation.** The daemon holds the ChatGPT session cookies and the control token in its
  own private config dir; the Pi process only talks to it over loopback HTTP and never holds the
  browser session.
- **Per-account isolation.** Each account is its own daemon instance (own port, own config dir, own
  Chrome profile), so accounts cannot interfere with each other.
- **Version isolation.** The embedded Bun runtime is a fixed, self-contained artifact; Pi's Node
  version and dependencies never affect the daemon.

This isolation is the reason the package is a **thin client** over the daemon: the boundary is a
process boundary, not a code boundary. The package never imports the daemon's internals; it drives
the daemon over loopback HTTP and the broker socket.

### 3.1 Keep the daemon as the single owner of browser behavior

The package must stay a **thin client** over the daemon. The daemon owns: Chrome, login, session,
DOM parsing, replay, compaction, SSE, concurrency, and the turn broker. The package owns: Pi provider
registration, tools, hooks, lifecycle, and cross-backend orchestration. This keeps browser logic in
one place and the package clean.

### 3.2 Platform portability (macOS is required, not optional)

**macOS support is a requirement, not a nice-to-have.** The build script
(`scripts/build-runtime-bundle.ts`) is already platform-agnostic — it uses `process.platform`/
`process.arch` and produces a darwin bundle when run on macOS. The only hard gate is
`src/daemon/runtime.ts` (`if (platform !== "linux") throw ...`). The required work:

- Relax `runtime.ts` to accept `darwin` and validate the manifest against the running platform.
- Build the runtime on macOS (or cross-build) so `dist/daemon/runtime/` contains the right artifact
  per host.
- Confirm **system Chrome via Playwright** works on macOS (darwin Chrome path is already in
  `src/config.ts` `defaultChromeExecutable()`).
- Add a macOS CI build/smoke lane so the darwin artifact is verified, not just produced.
- Update docs from "Linux-first" to "Linux and macOS" once darwin artifacts are produced and tested.

macOS is well-scoped: the daemon already handles darwin Chrome paths and the build is
platform-agnostic. The work is in the package boundary (`runtime.ts`), the build/CI, and
verification.

### 3.3 Hybrid capture (interception primary, DOM fallback)

The top robustness investment for the core path. Prefer implementing it **inside the vendored
daemon** so DOM/SSE stay one owned path, rather than in the package. This is the Prometheus-derived
idea (network interception) combined with the daemon's DOM reliability.

### 3.4 Footprint

184MB is heavy. If a smaller runtime matters later, revisit whether the embedded Bun can be trimmed,
but do **not** port to Node. The footprint is the accepted cost of reusing the daemon.

### 3.5 Use the current runtime: the canonical reason

**Decision: use the current runtime (vendor + embed Bun, child process).** Electron is not an option
for this package. The canonical reason is:

> **The package's job is to register ChatGPT Web (and other providers) as a provider inside Pi.
> That requires a small plugin that Pi controls — not a standalone desktop application. The current
> runtime already does this by reusing the mature daemon as an isolated child process over your
> existing system Chrome. Electron would add a whole second browser and its own app shell, which
> fights the provider model and is pure overhead.**

Concretely, the current runtime wins for four reasons:

1. **Pi is the center.** The goal is to register a provider inside Pi. A provider should be a small
   plugin Pi loads and controls — not a giant standalone app.
2. **No second browser.** We already use your **system Chrome** via Playwright. Electron bundles its
   own Chromium, which is a redundant, heavy browser you never asked for.
3. **We control the lifecycle.** We start/stop/login each account independently. A child process is
   easy for Pi to control. Electron controls its own app lifecycle, which fights us.
4. **Reuse the mature daemon as-is.** The daemon already runs in Bun; we embed it without changing
   it. Electron would be a large rewrite for no benefit.

Electron would only matter if we later want a **standalone GUI dashboard** (codexweb's control
center) — a separate product, not this package's core. For a Pi provider package, the current
runtime is the choice.

---

## 4. Target architecture (as the package grows)

```text
Pi process (Node)
├── provider registration + readiness hook
├── account registry + private config bootstrap
├── daemon lifecycle manager (per-account, health-gated)
├── daemon HTTP tools + HUD
├── settings + public web search/fetch
├── account-scoped Full-harness config
└── backend adapter seam (openai now; anthropic/google future)

Bundled child runtime (embedded Bun, per platform)
└── codex-chatgpt-web daemon
    ├── browser worker (hybrid capture: interception + DOM fallback)
    ├── login/session/replay/compaction/SSE
    ├── turn broker (full-mode local tools)
    └── tunnel client (full-mode remote bridge)
```

### Key principles
1. **One owner of browser behavior** — the daemon. The package never re-implements automation.
2. **Package-owned lifecycle** — login/start/stop/restart/health-gating stay in the package.
3. **Explicit, isolated runtime boundary** — the daemon is a separate child process with its own
   failure, credential, account, and version isolation; the package is a thin client over it.
4. **Per-account isolation** — one daemon per account, one provider per account (Strategy A).
5. **Backend seam** — future Claude/Gemini plug in behind `src/backends/`, not as new runtimes.
6. **Platform artifacts** — build per host (linux-x64 now, darwin next); no cross-platform runtime
   hacks.
7. **Use the current runtime** — vendor + embed Bun as a child process over system Chrome; no
   Electron.

---

## 5. Open questions

| Question | Note |
|----------|------|
| Should the runtime be trimmed? | Only if footprint becomes a real problem; do not port to Node. |
| Cross-build vs. build-on-host for macOS? | Build-on-host is simplest; cross-build needs a Bun cross-compile story. |
| Where does hybrid capture live? | In the vendored daemon, so DOM/SSE stay one owned path. |
| Should the daemon be re-vendored to a newer snapshot? | Only when a specific upstream fix matters; general sync is out of scope. |

---

## 6. Bottom line

- **Use the current runtime: vendor + embed Bun as an isolated child process.**
- The canonical reason: the package registers a provider **inside Pi**, which requires a small
  plugin Pi controls — not a standalone app. The current runtime reuses the mature daemon over your
  existing **system Chrome**; Electron would add a second browser and its own app shell for no
  benefit.
- The runtime boundary is **explicit and isolated**: a separate child process with its own failure,
  credential, account, and version isolation. The package is a **thin client** over the daemon.
- **System Chrome via Playwright is the preferred browser** — no bundled Chromium, and it keeps the
  headed login/Cloudflare reliability.
- **macOS support is required** — Linux and macOS are both targets; the work is well-scoped
  (relax `runtime.ts`, build/verify a darwin artifact, add CI).
- The real architecture work is **platform portability (macOS)** and **hybrid capture**, both
  well-scoped.
- Do **not** port to Node, run as a system service, re-implement browser automation, or adopt
  Electron.
