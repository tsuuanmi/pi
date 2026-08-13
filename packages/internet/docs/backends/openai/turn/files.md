# backends/openai/turn/files

Mirrors `src/backends/openai/turn/files.ts`.

Bounded, workspace-local `@file` expansion for the request payload.

## `expandLocalFileReferences`

```ts
expandLocalFileReferences(payload: unknown, cwd: string): Promise<unknown>
```

Scans the active (last) user message's `input_text` parts for `@path` references matching
`/(?:^|\s)@([A-Za-z0-9._/-]+)/g`, resolves each inside the workspace, reads bounded file contents,
and appends a generated `input_text` part carrying a `files` JSON array under a marker
(`<local_file_references_json>`). If nothing matches, or the payload shape is ineligible, or the
marker is already present, the payload is returned unchanged.

### Safety and bounds

- At most `5` unique referenced files (`MAX_FILES`).
- Each file at most `128 * 1024` bytes (`MAX_FILE_BYTES`); total at most `256 * 1024`
  (`MAX_TOTAL_BYTES`).
- References must resolve to readable regular text files inside the workspace: hidden paths,
  `..` escapes, and absolute escapes are rejected. Paths that don't exist are skipped only when they
  carry no `/` or `.` (treated as an intended filename); otherwise they raise an error.
- Binary content (NUL byte) is rejected; text is decoded with strict UTF-8 (`fatal: true`).

Violations raise `InternetError` with code `daemon_rejected`. Files are sent by their workspace
relative path so the daemon sees stable references.
