# Undo Stack

Generic undo stack with clone-on-push semantics.

```typescript
class UndoStack<S> {
  push(state: S): void;     // pushes a structuredClone of state
  pop(): S | undefined;      // returns the snapshot directly (no re-clone)
  clear(): void;
  get length(): number;
}
```

Snapshots are deep-cloned on `push` so callers can keep mutating the live state without affecting the stack. `pop` returns the stored snapshot directly because it is already detached.

Used by the built-in `Editor` to back undo/redo of multi-line edits.

## See Also

- [Editor Component Interface](../contracts/editor-component.md) — `addToHistory?` is the hook the editor uses to feed this stack.