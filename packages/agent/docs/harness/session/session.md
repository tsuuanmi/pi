# Session

Session persistence and tree-structured conversation management.

## `buildSessionContext()`

```typescript
function buildSessionContext(
  pathEntries: SessionTreeEntry[],
): SessionContext
```

Builds a `SessionContext` from a path of session tree entries. Resolves compaction entries, model changes, thinking level changes, and active tool changes.

The resulting context contains:
- `messages` — Agent messages reconstructed from entries
- `thinkingLevel` — Resolved thinking level
- `model` — Resolved model info
- `activeToolNames` — Resolved active tool names

## `Session` Class

```typescript
class Session<TMetadata extends SessionMetadata = SessionMetadata> {
  // Tree navigation
  getRootId(): string | undefined
  getCurrentId(): string | undefined
  getEntry(id: string): SessionTreeEntry | undefined
  getPathToRoot(id?: string): SessionTreeEntry[]

  // Tree mutation
  append(entry: Omit<SessionTreeEntryBase, "id" | "parentId" | "timestamp">, parentId?: string): string
  update(id: string, updates: Partial<SessionTreeEntry>): void
  delete(id: string): void

  // Branch operations
  branchFrom(parentId: string, entry: ...): string
  getChildren(id: string): string[]
  getBranches(id: string): string[]

  // Metadata
  get metadata(): TMetadata
  set metadata(value: TMetadata)

  // Persistence
  save(): Promise<void>
  load(id: string): Promise<void>
}
```

## Session Tree Entries

Session entries form a tree structure via `id`/`parentId` fields:

| Entry Type | Description |
|-----------|-------------|
| `MessageEntry` | User, assistant, or tool result message |
| `ThinkingLevelChangeEntry` | Thinking level change event |
| `ModelChangeEntry` | Model change event |
| `ActiveToolsChangeEntry` | Active tools change event |
| `CompactionEntry` | Compaction summary |
| `BranchSummaryEntry` | Branch summary |
| `CustomEntry` | Custom application data |
| `CustomMessageEntry` | Custom message visible to the model |
| `LabelEntry` | User label/bookmark |
| `SessionInfoEntry` | Session metadata |

## Session Storage

Two storage backends are available:

- **`JsonlRepo`** — JSONL file-based persistent storage
- **`MemoryRepo`** — In-memory storage for testing

Both implement the `SessionStorage` interface.

## `uuidv7()`

```typescript
function uuidv7(): string
```

Generates a UUIDv7 (time-sortable) for session entry IDs.