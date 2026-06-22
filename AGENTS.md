# AGENTS.md

# Agent Development Guide

This file defines the rules every coding agent must follow in this repository.

The goals are:

* understand docs and source before changing code;
* make small, intentional changes;
* keep the workspace and commit history clean;
* avoid overwriting other agents' work;
* verify changes with the right checks;
* keep docs and changelogs synchronized with code.

---

## 1. Instruction Priority

Follow instructions in this order:

1. The user's latest explicit instruction.
2. This `AGENTS.md`.
3. Project docs such as `README.md`, `CONTRIBUTING.md`, package docs, and tool configs.
4. Existing code patterns.

If the user's instruction conflicts with this file, explain the conflict and ask for explicit confirmation before overriding a safety rule.

---

## 2. Communication

* Be concise, direct, and technical.
* No emojis in commits, issues, PR comments, code, or technical summaries.
* No filler or excessive praise.
* Answer the user's direct question before making edits or running implementation commands.
* When responding to feedback or analysis, explicitly say whether you agree or disagree before explaining changes.
* State assumptions when proceeding under uncertainty.

Ask before proceeding when ambiguity affects correctness, data loss, public APIs, schemas, user-visible behavior, dependency changes, destructive operations, or removal of intentional functionality.

For low-risk ambiguity, state the assumption and proceed with the simplest reversible approach.

---

## 3. Docs and Source First

Before implementation, read both relevant documentation and affected source code.

Docs explain intent. Source code is the ground truth.

Read relevant docs when the task touches:

* architecture;
* public APIs;
* CLI behavior;
* configuration;
* pipeline stages;
* data flow;
* schemas or data models;
* generated outputs;
* user-visible behavior.

Read affected source files in full before editing them, making broad changes, investigating behavior, auditing correctness, or modifying files you have not fully inspected.

Do not rely only on search snippets for broad or sensitive changes.

If docs and source disagree, follow the source code and update the docs when documented behavior changes.

---

## 4. Standard Workflow

### Context

Before editing:

1. Read relevant docs.
2. Read affected source files.
3. Check existing patterns, utilities, naming conventions, and error handling.
4. Identify affected source files, tests, docs, changelogs, generated files, configs, package files, and lockfiles.
5. Identify the language-specific rules that apply: Python, TypeScript, Rust, or multiple languages.

### Plan

Before implementation, state briefly:

1. what will change;
2. what will stay the same;
3. likely affected files;
4. verification to run.

Ask for confirmation only when the change is risky, destructive, blocking-ambiguous, or broader than requested.

### Implement

During implementation:

1. Work in an isolated worktree when available.
2. Create temporary backups in `/tmp` before editing files.
3. Make surgical changes only.
4. Follow existing style.
5. Use existing utilities before adding new ones.
6. Avoid unrelated cleanup.
7. Avoid speculative abstractions.
8. Preserve intentional behavior unless the user asks to change it.

### Verify

Before finalizing:

1. Review diffs.
2. Run required language-specific checks.
3. Run only allowed tests.
4. Confirm no backup files were created inside the repo.
5. Update docs and changelogs when required.
6. Confirm `git status` contains only intentional changes.

### Final Response

The final response must include:

* what changed;
* files modified;
* verification commands run;
* tests run or skipped;
* docs and changelog status;
* assumptions or risks.

Keep it concise.

---

## 5. Worktree Rules

Use an isolated worktree for implementation when available.

Preferred command:

```bash
omx -w <branch>
```

Do not modify the main checkout directly when the repository provides a worktree workflow.

Do not merge, push, delete branches, or remove worktrees unless the user asks.

Only clean up a worktree after the user-approved integration path is complete.

---

## 6. Temporary Backups

Always store edit backups in `/tmp`.

Do not create `.bak` files inside the repository.

Do not create WIP commits only for checkpointing.

Commit history must stay clean.

### Backup Location

Use:

```text
/tmp/agent-backups/<task-id>/
```

Mirror the original relative path inside the backup directory to avoid filename collisions.

### Backup Workflow

Before editing a file:

```bash
task_id="<short-task-name>"
file="path/to/file"
backup_root="/tmp/agent-backups/$task_id"

mkdir -p "$backup_root/$(dirname "$file")"
cp "$file" "$backup_root/$file.bak"
```

After editing:

```bash
diff "$backup_root/$file.bak" "$file"
```

To restore:

```bash
cp "$backup_root/$file.bak" "$file"
```

For risky multi-step edits, use step-specific backups:

```text
/tmp/agent-backups/<task-id>/step-1/path/to/file.bak
/tmp/agent-backups/<task-id>/step-2/path/to/file.bak
```

Rules:

* Create backups only for files you will edit.
* Always keep backups outside the repo.
* Never create in-repo `.bak` files.
* Never commit backup files.
* Do not use WIP commits as checkpoints.
* Backups in `/tmp` may remain after the task.
* Before checks and final response, confirm the repo contains no backup files.

---

## 7. Git Rules

Multiple agent sessions may be running in the same repository. Do not touch work that is not yours.

Safe commands:

```bash
git status
git diff
git diff -- <path>
git diff --stat
git add <explicit-path>
git restore -- <explicit-path>
```

Only restore files you modified in this session.

Never run:

```bash
git reset --hard
git checkout .
git clean -fd
git stash
git add .
git add -A
git commit --no-verify
```

When staging is needed, stage explicit paths only:

```bash
git add <path1> <path2>
```

Never stage the entire repository.

Never commit unless the user explicitly asks.

When committing:

1. Run required checks first.
2. Run `git status`.
3. Stage explicit paths only.
4. Run `git diff --cached`.
5. Commit only files changed in this session.
6. Use a concise, informative message.
7. Do not create WIP checkpoint commits.

Preferred commit format:

```text
<type>(<scope>): <message>
```

Common types:

```text
feat
fix
docs
refactor
test
chore
```

If conflicts occur:

* resolve conflicts only in files you modified;
* if a conflict appears in a file you did not modify, stop and ask;
* never force push unless the user explicitly confirms the risk.

---

## 8. Change Scope

Every changed line must trace back to the task.

Do not:

* refactor unrelated code;
* reformat unrelated files;
* rename unrelated symbols;
* remove unrelated dead code;
* upgrade unrelated dependencies;
* modify generated files directly;
* change lockfiles unless required;
* add new configuration unless needed.

If unrelated issues are found, mention them instead of fixing them.

Prefer the smallest correct change.

Do not add speculative features, single-use abstractions, unused configuration, unnecessary flexibility, unnecessary error handling, or broad rewrites for small fixes.

Before adding new logic, check for existing helpers, utilities, models, constants, validators, serializers, logging patterns, error types, CLI patterns, and test patterns.

---

## 9. Language Rules

### Python

Follow existing project style.

Prefer standard library first, existing utilities, typed functions, small functions, explicit realistic error handling, and clear data models.

When already used by the project, prefer:

* Loguru for logging;
* Pydantic for data models;
* `pathlib` for path handling;
* `pytest` conventions for tests.

Avoid untyped public functions, broad `except Exception`, global mutable state, duplicate validation logic, speculative abstractions, and unrelated formatting changes.

Use the project package manager. If the project uses `uv`, use `uv`.

Common dependency commands:

```bash
uv add <package>
uv sync
```

For Python source changes, run configured checks:

```bash
ruff check .
ruff format .
basedpyright
```

Use scoped paths when the project expects them:

```bash
ruff check src/ tests/
ruff format src/ tests/
basedpyright src/
```

Do not run the full test suite unless explicitly asked.

Do not run:

```bash
pytest
pytest tests/
```

unless the user asks.

If the user asked you to create or modify a test, run only the relevant test file or test case:

```bash
pytest path/to/test_file.py -q
pytest path/to/test_file.py::test_name -q
```

Do not run integration, network, credential-dependent, paid-provider, destructive, or long-running tests unless explicitly requested.

---

### TypeScript

Follow existing project style.

Prefer top-level imports, explicit public-boundary types, existing utilities and types, small functions, simple control flow, and strict type safety.

Avoid `any` unless absolutely necessary, unsafe casts, duplicate type definitions, inline imports, dynamic type imports, broad formatting changes, and dependency downgrades to fix type errors.

Do not use inline imports:

```ts
// Do not use
await import("pkg");
type X = import("pkg").X;
```

Use top-level imports instead.

If the project runs TypeScript in strip-only mode, use only erasable TypeScript syntax.

Avoid syntax requiring JavaScript emit:

* `enum`;
* `namespace`;
* `module`;
* parameter properties;
* `import =`;
* `export =`.

Use explicit fields with constructor assignments:

```ts
class UserService {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }
}
```

Check package types in `node_modules` or official type definitions. Do not guess external API shapes.

Treat dependency and lockfile changes as reviewed code.

For npm projects:

```bash
npm install --ignore-scripts
npm ci --ignore-scripts
npm install --package-lock-only --ignore-scripts
```

Do not run lifecycle scripts unless the user asks.

After TypeScript source changes, run the repository-defined check command.

Common commands:

```bash
npm run check
npm run lint
npm run typecheck
npm run format:check
```

If project rules require full output, do not pipe to `tail`.

Do not run build commands unless requested or required by project rules.

Avoid:

```bash
npm run build
```

unless the user asks.

Do not run full test suites unless explicitly asked.

Avoid:

```bash
npm test
vitest
npx vitest
```

unless the user asks or the project specifically allows it.

If the user asked you to create or modify a test file, run the specific test only:

```bash
npm run test -- path/to/test.ts
node ./node_modules/vitest/vitest.mjs --run path/to/test.ts
node ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts
```

Do not run e2e, browser, provider-backed, network, paid-token, credential-dependent, destructive, or long-running tests unless explicitly requested.

---

### Rust

Follow existing project style.

Prefer standard library first, existing project modules, explicit error types, `Result` for fallible operations, small functions, clear ownership, minimal cloning, and existing logging/serialization patterns.

Use project-adopted libraries when already present:

* `log` or `tracing` for logging;
* `serde` for serialization;
* `clap` for CLI;
* `thiserror` or existing error conventions for errors.

Avoid unnecessary `clone`, broad rewrites, `unwrap` or `expect` in production code unless already accepted nearby, duplicate parsing or validation logic, unrelated formatting changes, and unnecessary features in `Cargo.toml`.

Use Cargo.

Common dependency commands:

```bash
cargo add <crate>
cargo update -p <crate>
```

Avoid broad `Cargo.lock` updates unless required.

For Rust source changes, run configured checks:

```bash
cargo fmt --check
cargo clippy -- -D warnings
```

Use workspace commands when the project expects them:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```

Do not run builds unless requested or required by project rules.

Avoid:

```bash
cargo build
cargo build --release
```

unless the user asks.

Do not run the full test suite unless explicitly asked.

Avoid:

```bash
cargo test
cargo test --workspace
```

unless the user asks.

If the user asked you to create or modify a test, run only the relevant targeted test:

```bash
cargo test test_name
cargo test -p crate_name test_name
cargo test --test integration_file test_name
```

Do not run integration, network, credential-dependent, destructive, or long-running tests unless explicitly requested.

---

## 10. Generated Files

Do not modify generated files directly unless project rules explicitly allow it.

If a generated file must change:

1. Find the generator.
2. Modify the generator or source data.
3. Regenerate the generated file.
4. Review the generated diff.
5. Mention generated files in the final response.

Generated files may include:

* `*.generated.ts`;
* generated API clients;
* generated schemas;
* protobuf outputs;
* OpenAPI outputs;
* model metadata;
* codegen snapshots.

If unsure whether a file is generated, inspect headers, docs, and build scripts before editing.

---

## 11. Tests Policy

Default rule: do not run full test suites unless explicitly asked.

Do not create new tests unless explicitly asked.

If the user asks you to create or modify tests, run only the relevant targeted tests and iterate until they pass.

Do not run:

* full test suites;
* e2e tests;
* integration tests requiring services;
* network tests;
* credential-dependent tests;
* paid-provider tests;
* destructive tests;
* long-running benchmarks.

If tests are skipped, state why in the final response.

Example:

```text
Tests not run because full test suites are not run unless explicitly requested.
```

---

## 12. Verification

Before running lint, format, type check, tests, builds, or package commands:

```bash
git status
find . -name "*.bak" -print
```

There must be no in-repo backup files.

If `.bak` files are found, stop. Do not remove files that may belong to another user or tool without confirmation.

Required verification by change type:

* Docs-only changes: review Markdown and run docs lint if configured.
* Python source changes: run configured Python lint, format, and type checks.
* TypeScript source changes: run the configured TypeScript check command.
* Rust source changes: run configured Rust format and clippy checks.
* Dependency changes: use safe package-manager commands and review lockfile diffs.
* Generated file changes: run the generator and review generated diffs.

Before finalizing:

```bash
git diff
git status
```

Confirm:

* every changed line is intentional;
* no unrelated files changed;
* no backup files are inside the repo;
* no temp files are inside the repo;
* no accidental lockfile changes exist;
* no unrelated formatting churn exists.

---

## 13. Documentation

Update docs when source changes affect:

* public APIs;
* CLI behavior;
* configuration;
* data models;
* schema fields;
* column names;
* pipeline stages;
* generated outputs;
* error messages;
* setup steps;
* user-visible behavior.

Do not update docs for purely internal code changes unless the docs would otherwise become misleading.

When updating docs:

1. Read the relevant section first.
2. Keep changes concise.
3. Match existing doc style.
4. Verify docs match the actual code.
5. Do not rewrite unrelated sections.

If no docs update is needed, say why in the final response.

---

## 14. Changelog

Update changelogs for user-visible or behavior-relevant changes.

Update changelog for:

* features;
* bug fixes;
* behavior changes;
* public API changes;
* CLI changes;
* config changes;
* schema changes;
* data model changes;
* pipeline changes;
* dependency changes that affect users;
* breaking changes;
* removed behavior.

Do not update changelog for:

* typo-only changes;
* formatting-only changes;
* comment-only changes;
* internal refactors with no behavior change;
* internal docs edits with no user-visible effect;

unless the user asks.

Use the project's existing changelog location and format.

Common locations:

```text
CHANGELOG.md
packages/*/CHANGELOG.md
crates/*/CHANGELOG.md
```

If the project uses an `[Unreleased]` section, add entries there.

Common sections:

```text
### Breaking Changes
### Added
### Changed
### Fixed
### Removed
```

Rules:

* Read the full target changelog section first.
* Append to existing subsections.
* Do not duplicate subsections.
* Do not edit released version sections unless explicitly asked.
* Keep entries concise.
* Use one bullet per change.
* Prefix entries with a bold scope when the project uses scoped entries.

Example:

```md
- **api**: Validate missing request fields before processing.
```

---

## 15. Dependency Security

Treat dependency and lockfile changes as code changes.

General rules:

* Do not add dependencies unless necessary.
* Prefer existing dependencies.
* Review lockfile diffs.
* Do not run install scripts unless the user asks.
* Do not bypass security gates silently.
* Do not downgrade dependencies just to hide type or lint errors.
* Explain dependency changes in the final response.

Language-specific commands:

Python:

```bash
uv add <package>
uv sync
```

TypeScript:

```bash
npm install --ignore-scripts
npm ci --ignore-scripts
npm install --package-lock-only --ignore-scripts
```

Rust:

```bash
cargo add <crate>
cargo update -p <crate>
```

Follow project-specific package manager conventions when they differ.

---

## 16. Final Checklist

Before final response, verify:

* [ ] Relevant docs were read.
* [ ] Affected source files were read.
* [ ] Existing patterns were checked.
* [ ] Temporary backups were stored in `/tmp`.
* [ ] No WIP checkpoint commits were created.
* [ ] No in-repo `.bak` files exist.
* [ ] Changes are surgical and task-related.
* [ ] No unrelated formatting churn exists.
* [ ] No unrelated dependency or lockfile changes exist.
* [ ] Generated files were not edited directly unless allowed.
* [ ] Required checks were run.
* [ ] Full tests were not run unless requested.
* [ ] Targeted tests were run only when allowed or requested.
* [ ] Docs were updated when needed.
* [ ] Changelog was updated when needed.
* [ ] `git diff` was reviewed.
* [ ] `git status` was reviewed.
* [ ] Final response includes changes, files, verification, tests, docs/changelog status, assumptions, and risks.

---

## 17. Final Response Template

```text
Changed:
- <summary>

Files:
- <file>: <what changed>

Verification:
- <command>: passed / failed / not run, with reason

Tests:
- <test command>
- Not run because full test suites require explicit request

Docs:
- Updated <doc>
- Not updated because <reason>

Changelog:
- Updated <changelog>
- Not updated because <reason>

Notes:
- <assumptions or risks>
```
