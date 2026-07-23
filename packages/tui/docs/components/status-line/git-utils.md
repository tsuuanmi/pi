# Status Line Git Utils

Parse `git status --porcelain` output into staged/unstaged/untracked counts. Ported from gajae-code `utils/git.ts`.

```typescript
interface GitStatusSummary { staged: number; unstaged: number; untracked: number; }
function parseStatusPorcelain(text: string): GitStatusSummary;
function runGitStatusPorcelain(cwd: string): Promise<GitStatusSummary | null>;
```

## Counting rules

For each porcelain line `XY <path>`:

- `??` (untracked) counts as 1 **untracked** and does not count toward staged/unstaged (it is not yet tracked by git).
- The first column `X` not space/`?` counts as 1 **staged** (includes renames `R ` and copies `C `).
- The second column `Y` not space counts as 1 **unstaged**.

A single file can contribute to both staged and unstaged (e.g. `MM`).

## `runGitStatusPorcelain`

Runs `git --no-optional-locks status --porcelain` in `cwd` and parses the counts. It catches every failure mode and resolves `null` so the render path never throws:

- git binary missing (`ENOENT`)
- permission errors (`EACCES`)
- non-zero exit (e.g. inside a corrupt repo)
- a non-git cwd (`.git` absent)

The caller renders an empty/branch-only git segment when the result is `null`. The status line component caches results with a 10s refresh and a generation guard (see [Component](status-line.md)).

## See Also

- [Segments](segments.md) — the `git` segment consumes `GitStatusSummary`.