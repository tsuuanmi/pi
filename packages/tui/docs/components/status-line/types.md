# Status Line Types

Type definitions for the status line: segment identifiers, settings, segment/preset/separator shapes, and the host interfaces the component binds to.

## Segment identifiers

```typescript
type StatusLineSegmentId =
  | "model" | "mode" | "git" | "path"
  | "context_pct" | "context_total"
  | "token_in" | "token_out"
  | "session_name" | "subagents";
```

`thinking` is intentionally not a segment — it is folded into `model` via `segmentOptions.model.showThinkingLevel`. The 10 ids above are the only legal segment ids.

## Settings

```typescript
interface StatusLineSettings {
  preset?: StatusLinePreset;            // "default" | "custom"
  leftSegments?: StatusLineSegmentId[];   // left-to-right
  rightSegments?: StatusLineSegmentId[];  // right-aligned
  separator?: StatusLineSeparatorStyle;   // "slash"
  segmentOptions?: StatusLineSegmentOptions;
  showHud?: boolean;                     // append HUD details inline when present (default true)
}
```

When `leftSegments`/`rightSegments`/`separator`/`segmentOptions` are omitted, they fall back to the resolved preset. Per-segment options are merged over the preset's options (shallow merge per segment).

```typescript
interface StatusLineSegmentOptions {
  model?: {
    showThinkingLevel?: boolean;   // default true
    showProviderPrefix?: boolean;  // default true — prepend `(provider)`
  };
  path?: {
    abbreviate?: boolean;           // default true — `~` for home
    maxLength?: number;             // default 40, in characters
    stripWorkPrefix?: boolean;      // no-op in Pi (gajae-only), default false
  };
  git?: {
    showBranch?: boolean;           // default true
    showStaged?: boolean;           // default true
    showUnstaged?: boolean;         // default true
    showUntracked?: boolean;         // default true
  };
}
```

## Segment / preset / separator shapes

```typescript
interface RenderedSegment { content: string; visible: boolean; }

interface StatusLineSegment {
  id: StatusLineSegmentId;
  render(ctx: SegmentContext): RenderedSegment;
}

interface SeparatorDef { left: string; right: string; }

interface PresetDef {
  leftSegments: StatusLineSegmentId[];
  rightSegments: StatusLineSegmentId[];
  separator: StatusLineSeparatorStyle;
  segmentOptions?: StatusLineSegmentOptions;
}
```

## SegmentContext

Computed once per render and shared across all segments. Contains everything a segment needs without reaching into session internals:

```typescript
interface SegmentContext {
  session: StatusLineSessionLike;
  width: number;                       // terminal columns available to the rail
  options: StatusLineSegmentOptions;
  usageStats: { input: number; output: number };
  contextPercent: number | null;       // null when unknown (e.g. after compaction)
  contextWindow: number;              // 0 when unknown
  autoCompactEnabled: boolean;         // drives the `(auto)` indicator
  subagentCount: number;               // running + paused subagents
  availableProviderCount: number;      // drives the `(provider)` prefix
  git: { branch: string | null; status: GitStatusSummary | null };
  hudPhase?: string;                    // active HUD phase, undefined when none
}
```

## Host interfaces

The component is host-agnostic; it binds to two host-supplied interfaces:

```typescript
interface StatusLineSessionLike {
  state: {
    model?: { id?: string; name?: string; provider?: string; contextWindow?: number; reasoning?: boolean } | null;
    thinkingLevel?: string | null;
  };
  sessionId?: string;
  sessionManager: {
    getEntries(): readonly StatusLineSessionEntry[];
    getSessionName(): string | undefined;
    getCwd(): string;
  };
  getContextUsage(): { contextWindow?: number; percent?: number | null } | null | undefined;
  subagentManager?: { getActiveCount(): number };
}

interface StatusLineDataProvider {
  getGitBranch(): string | null;
  getExtensionStatuses(): ReadonlyMap<string, string>;
  getAvailableProviderCount(): number;
}
```

## HUD entry reader

Inline HUD details are driven by an optional async reader. Provider failures never throw on the render path:

```typescript
interface StatusLineHudEntryReaderOptions { cwd: string; sessionId: string; }
type StatusLineHudEntryReader = (
  options: StatusLineHudEntryReaderOptions,
) => Promise<readonly ActiveHudEntry[] | undefined>;

interface StatusLineComponentOptions {
  readHudEntries?: StatusLineHudEntryReader;
}
```

`StatusLineHudEntry`, `StatusLineHudChip`, `StatusLineHudSeverity`, and `StatusLineHudSummary` are re-exports of the HUD model types (see [HUD Model](../hud/model.md)).

## See Also

- [Component](status-line.md) — how these types are consumed.
- [Segments](segments.md) — the segment renderers.
- [Presets](presets.md) — built-in preset values.