# Internet — Daemon Ownership Brainstorm

This historical decision record captures the findings that led to the "own the daemon" phase and
the options considered. The recommended combined behavior is now implemented; see `architecture.md`
and `how-it-works.md` for authoritative current behavior.

Status: **implemented.** Model metadata remains separate work.

---

## 1. The problem (why this phase exists)

The current `@tsuuanmi/pi-internet` package is **HTTP-only**: it reads `config.json` and talks to
the daemon's `/v1/responses`, `/healthz`, and `/admin/*` routes. It never starts the daemon and
never drives its setup. The user must install and run `codex-chatgpt-web` externally.

On Linux this breaks:

```
$ bun run setup --browser-only
codex-chatgpt-web: Terminal-only managed Chrome setup currently requires macOS.
Use the Codex Web GPT launcher on Windows or Linux.
error: script "setup" exited with code 1
```

The goal of this phase: **the package owns its daemon** — Linux-first, auto-start on load, and an
**isolated browser** so the user's normal browser is never disturbed.

> **Updated requirement (confirmed):** the package must be **fully self-contained** — it should
> handle everything needed and require **no other repository** to be installed or run. This is a
> significant scope change from the original "spawn the external daemon" plan.

---

## 2. Critical constraint: the daemon is a Bun application, Pi runs on Node

This is the single most important finding and it shapes every option below.

- The daemon's `package.json` declares `packageManager: "bun@1.3.14"` and a `bun` devDependency.
- The daemon source uses **Bun-specific APIs** that do not exist in Node:
  - `Bun.serve(...)` — the HTTP server (`src/server.ts`).
  - `Bun.zstdDecompress(...)` — request-body decompression (`src/http-body.ts`).
  - `Bun.main` and `Bun.which(...)` — process/executable resolution (`src/config.ts`).
- The daemon's own runtime bundle (`scripts/build-runtime-bundle.ts`) targets `bun` and embeds a
  Bun executable (`target: "bun"`, `embeddedBunExecutable()`).
- The daemon is large: **53 source files / ~15,640 lines**, a 39-file Electron launcher, and
  ~125MB of dependencies.

**Consequence:** the daemon cannot run as plain Node code. Any self-contained approach must either
(a) bundle/embed a Bun runtime, (b) port the Bun-specific calls to Node, or (c) reimplement the
browser automation natively. Each is a large effort with real risk.

### 2.1 Measured footprint of the self-contained runtime

I built the daemon's own runtime bundle to measure what "self-contained" actually costs:

- `bun run build` produces `dist/runtime/` at **184MB** total:
  - `runtime/bun` — embedded Bun executable: **89MB**.
  - `app/` — bundled CLI + `node_modules` + `package.json`: **96MB**.
  - `bin/codex-chatgpt-web` — a small POSIX launcher script.
- The bundle is **platform-specific**: `manifest.json` pins `platform: "linux"`, `arch: "x64"`,
  `bunVersion: "1.3.14"`, `playwright: "1.62.0"`, and an `appVersion`.
- The daemon's `package.json` pins `packageManager: "bun@1.3.14"`.

**Consequence for vendoring:** a self-contained `packages/internet` would carry a **~184MB
platform-specific runtime** (or a build step that produces it, requiring Bun at build time). This is
a major footprint and portability tradeoff that must be accepted explicitly.

---

## 3. Findings (grounded in the daemon source)

### 2.1 The macOS gate is narrow

The macOS-only error comes from a single check in `src/setup.ts` (lines 269–272), which blocks
**terminal-only managed Chrome setup** on non-macOS. It is **not** a general platform restriction:

- `loginToChatGpt` (`src/browser-login.ts`) — the `login` subcommand — is **not** macOS-gated.
- `serve` (`src/cli.ts`) — the daemon HTTP server — is **not** macOS-gated.

So the daemon can run and log in on Linux; only the `setup` convenience flow is macOS-only.

### 2.2 The isolated browser already exists

`loginToChatGpt` launches Chrome with a **dedicated `--user-data-dir` profile**
(`src/browser-login.ts:332-342`) and stores the authenticated session in a private
`storageStatePath`. This is exactly the "isolated browser so it doesn't break my working browser"
requirement — it is the daemon's `managed-chrome` mode. The user's normal Chrome profile is never
touched.

### 2.3 `serve` is the daemon entrypoint

`bun run src/cli.ts serve` loads config and starts the long-running HTTP server. It is a child
process the package can spawn, health-gate, and stop.

### 2.4 The daemon is a separate Bun project

The daemon has a `bin` entry (`codex-chatgpt-web` → `./src/cli.ts`) and loads its config through
`$CODEX_CHATGPT_WEB_HOME`. The implemented package vendors the daemon and resolves its embedded-Bun
launcher from `dist/daemon/runtime`, then passes the private account directory explicitly.

### 2.5 Default Linux Chrome

`src/config.ts:279` defaults to `/usr/bin/google-chrome`. The daemon already resolves a Chrome
executable for the isolated profile.

---

## 4. Proposed architecture (revised for self-containment)

Because the daemon is a Bun application and Pi runs on Node, "fully self-contained" requires
**vendoring the daemon into the Pi monorepo and bundling a Bun runtime** (or porting it). The
package would own the daemon source, build it, and spawn it as a child process — no external repo.

New modules under `packages/internet/src/daemon/`:

| Module | Responsibility |
|--------|----------------|
| `locate.ts` | Resolve the bundled daemon runtime (built into the package); verify it exists. |
| `login.ts` | Run the daemon's `login` subcommand (Linux-compatible, isolated profile) to ensure a login state exists. |
| `lifecycle.ts` | Spawn the bundled daemon `serve` as a child, wait for `/healthz`, expose start/stop/restart. |
| `health.ts` | Health-gate provider registration (only register `chatgpt-web` once the daemon is up). |

Wiring changes:

- `extension.ts` becomes async: locate bundled daemon → ensure login → spawn `serve` → health-gate →
  register provider/tools/HUD.
- Add a `session_shutdown` hook to stop the daemon gracefully.
- Add an `internet_daemon` tool (status/start/stop/restart) for explicit control.

---

## 4.1 The key tradeoff (confirmed)

**We are not writing the ~15K lines ourselves.** We are **copying the daemon's existing ~15K lines
into our package** so it is self-contained. The cost is size (a ~184MB platform-specific runtime)
and a build step — but we do not re-invent any of the browser-automation, session, replay,
compaction, or SSE logic.

This is the explicit, accepted tradeoff for "no other repo":

- **We gain:** a self-contained package that Pi can load and use without installing or running any
  external repository.
- **We pay:** a large vendored tree (~15.6k lines + launcher + ~125MB deps) and a ~184MB
  platform-specific runtime (or a Bun-requiring build step to produce it).
- **We accept:** the vendored daemon is a **fixed MVP snapshot** — no upstream sync.

---

## 4.2 Best of both: what to take from each repo

Both repos pursue the same idea (use browser-based AI as a model backend without API keys) but
differ in capture strategy and integration surface. For the vendored daemon, we take the **best of
both**:

| Concern | codex-chatgpt-web (daemon) | Prometheus | Best of both for `internet` |
|---------|---------------------------|------------|------------------------------|
| Model-output capture | DOM parsing (rendered assistant turn) | Network interception (SSE/JSON wire) | **Hybrid**: interception primary, DOM fallback (see `best-of-both.md`) |
| Browser isolation | Dedicated `--user-data-dir` profile | Per-provider browser partitions | **Dedicated isolated profile** (daemon) — never touches the user's browser |
| Integration surface | HTTP `/v1/responses` + `/admin/*` | MCP server + REST `/v1/chat/completions` | **Pi provider + tools** (internet) — not a generic MCP/REST service |
| Multi-provider | Single ChatGPT Web path | 11-provider catalog | **Backend seam** (internet) — future API backends, not browser-driven |
| Login flow | `login` subcommand (Linux-compatible) | Per-provider login check scripts | **Daemon's `login`** — isolated, Linux-first |
| Compaction | Rolling checkpoints + `/compact` | `convo_history_summarize` | **Daemon's compaction** — already integrated with the Responses path |

**Decision:** vendor the **daemon** (not Prometheus) as the runtime, because it already exposes the
`openai-responses` HTTP surface Pi needs and owns the isolated-browser login. Adopt Prometheus's
**hybrid-capture** idea as a later robustness improvement, and keep internet's **Pi-native**
integration rather than adding an MCP/REST layer.

---

## 5. Open question 1 — How to bundle the Bun runtime

### Options

**A. Vendor the daemon source + embed a Bun executable (recommended).**
- Pros: matches the daemon's own build (`build-runtime-bundle.ts` already embeds Bun); the package
  becomes truly self-contained; no porting risk.
- Cons: large vendored tree (~15.6k lines + launcher); must keep in sync with upstream; adds a
  build step that downloads/embeds a Bun binary.

**B. Port the Bun-specific calls to Node.**
- Pros: no embedded runtime; smaller footprint.
- Cons: `Bun.serve` → Node `http`/`undici`, `Bun.zstdDecompress` → a zstd lib, `Bun.main`/`Bun.which`
  → Node equivalents. High risk of subtle behavior drift; the daemon is not designed for Node.

**C. Reimplement browser automation natively (no daemon).**
- Pros: no Bun, no vendoring; the package talks to ChatGPT Web directly via Playwright.
- Cons: by far the largest scope; re-implements login, session, replay, compaction, SSE — all the
  daemon's hard-won behavior.

**Recommendation: A.** It is the only option that is both self-contained and low-risk, because it
reuses the daemon's own Bun-embedding build.

---

## 6. Open question 2 — Login on first run

### Options

**A. Auto-run login on first load (opens an isolated Chrome window).**
- Pros: fully "own it" — the user signs in once and the package handles the rest.
- Cons: opens a browser window at load time; surprising if the user just wants status; needs a
  "first run" flag so it doesn't re-open every load.

**B. Fail with a clear message telling the user to run login.**
- Pros: no surprise browser window; simplest.
- Cons: not "own it" — the user still runs a manual step.

**C. Auto-run login only when a model/tool is actually used (lazy), gated by a flag (recommended).**
- Pros: no surprise window at load; the package still owns login when it matters; a config flag
  (`autoLogin`) lets the user opt out.
- Cons: slightly more logic (lazy trigger + flag).

**Recommendation: C.** Auto-login is the "own it" behavior, but it should be **lazy** (triggered on
first real use) and **opt-out** via a flag, so loading Pi never surprises the user with a browser
window. A stored "login state exists" check avoids re-running login every load.

---

## 7. Open question 3 — Auto-start behavior

### Options

**A. Always auto-start on load.**
- Pros: matches the stated "auto-start on load"; daemon is always ready.
- Cons: spawns a child process even if the user never uses internet; slower Pi startup; needs
  graceful shutdown on exit.

**B. Lazy start (only when a model/tool is used).**
- Pros: no startup cost; no orphan process if unused.
- Cons: first model call pays the spawn + health-gate latency.

**C. Auto-start on load, but only if a login state exists (recommended).**
- Pros: matches "auto-start on load" while avoiding a pointless spawn when there is no authenticated
  session yet (which would fail anyway). Combines with Q2's lazy login: if no login state, defer
  start until login completes.
- Cons: slightly more state logic.

**Recommendation: C.** Auto-start on load when a login state already exists; otherwise defer until
login completes (lazy). This honors "auto-start on load" without spawning a daemon that cannot
serve.

---

## 8. Recommended combined behavior

1. **Bundle** the daemon runtime into the package (Q1: vendor + embed Bun).
2. **On load:** if a login state exists → **auto-start** `serve` and health-gate (Q3: C).
3. **On first real use** with no login state → **auto-run login** in an isolated Chrome window
   (Q2: C), then start `serve`.
4. **On Pi shutdown** → gracefully stop the daemon.
5. **Explicit control** via an `internet_daemon` tool (status/start/stop/restart).

---

## 9. Risks and open items

| Risk / item | Note |
|-------------|------|
| Vendored daemon size | ~15.6k lines + launcher + ~125MB deps; must be kept in sync with upstream. |
| Bun runtime embedding | Adds a build step that downloads/embeds a Bun binary; must match the daemon's pinned Bun version. |
| Login window at first use | Mitigated by lazy trigger + `autoLogin` opt-out flag. |
| Orphan daemon process | Mitigated by `session_shutdown` graceful stop + `internet_daemon stop`. |
| Chrome not found | The daemon already resolves `/usr/bin/google-chrome`; surface its error. |
| Model metadata mismatch | Unrelated to this phase; tracked separately in `review/implementation-review.md`. |

### Confirmed decisions

- **Option A** (vendor daemon source + embed Bun runtime) is accepted.
- Vendoring lives **inside `packages/internet/`** — no new package.
- **MVP-only**: no upstream sync; the vendored daemon is a fixed snapshot.

### Accepted footprint

- The self-contained runtime is **~184MB** and **platform-specific** (linux-x64 in the measured
  build). The package build must either commit this artifact or produce it via a Bun-requiring
  build step. This is the explicit cost of "no other repo."

---

## 10. Not in scope (this phase)

- Embedding the Electron `codex-web-gpt-launcher` (the daemon's own launcher is a separate app).
- Reimplementing browser automation natively.
- Fixing the model-metadata mismatch (separate review item).
- Upstream sync of the vendored daemon (fixed MVP snapshot).
