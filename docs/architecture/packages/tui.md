# `@tsuuanmi/pi-tui`

[Package README](../../../packages/tui/README.md) | [Package reference](../../../packages/tui/docs/index.md) | [Public barrel](../../../packages/tui/src/index.ts) | [Workspace overview](../package-overview.md) | [Integration map](../component-integration-map.md) | [Overlap audit](../package-overlap-audit.md)

## Role

`@tsuuanmi/pi-tui` is Pi's reusable terminal presentation toolkit. It converts terminal input into component events and converts width-constrained component output into synchronized differential terminal updates.

It is a workspace leaf: it does not import AI, Agent, Orchestrator, Workflows, Web Runtime, or Pi.

## Boundary

**Owns**

- Terminal startup/shutdown, raw input, resize handling, cursor/screen operations, bracketed paste, and keyboard protocol negotiation.
- The `Component`, `Focusable`, `Container`, `Terminal`, and editor contracts.
- TUI component-tree composition, focus, input dispatch, overlays, frame scheduling, and differential rendering.
- Reusable text, Markdown, receipt, loader, editor, selector, layout, message, HUD, and status-line components.
- Key parsing, keybindings, autocomplete, fuzzy matching, undo, word navigation, and stdin sequence buffering.
- Theme loading/validation, syntax highlighting, terminal color capability handling, and active theme state.
- ANSI-safe Unicode width, wrapping, truncation, slicing, and diff utilities.

**Does not own**

- Agent/model/tool/session/workflow behavior or application commands.
- Extension lifecycle or the public Pi `ctx.ui` API; Pi adapts that API to TUI components.
- Persistent settings, session state, themes, or workflow HUD files.
- Pi-specific dialogs and semantic rendering policy for coding tools.

## Public entry point

The package has one root entry, [`src/index.ts`](../../../packages/tui/src/index.ts), exposed through `main` and `types`. There is no package `exports` map and no documented subpath API.

The root groups the following public surfaces:

- Core component, container, focus, TUI, cursor marker, and overlay contracts.
- `Terminal` and `ProcessTerminal` plus capability and background-color helpers.
- Built-in display, editor, input, layout, selector, message, receipt, HUD, and status components.
- Autocomplete, keybinding, key parsing, stdin buffering, and editor contracts.
- Theme loading, validation, active-theme state, highlighting, and component theme adapters.
- ANSI and Unicode rendering utilities.

`#tui/*` aliases are internal.

## Components

| Component | Source | Responsibility |
|---|---|---|
| Component contract | [`src/components/component.ts`](../../../packages/tui/src/components/component.ts) | Width-constrained rendering, input, invalidation, disposal, focus, and child ownership |
| TUI runtime | [`src/tui.ts`](../../../packages/tui/src/tui.ts) | Focus, global input listeners, overlays, render coalescing, frame composition, cursor location, and terminal updates |
| Terminal adapter | [`src/terminal/runtime/terminal.ts`](../../../packages/tui/src/terminal/runtime/terminal.ts) | Abstract terminal operations and process-backed implementation |
| Terminal features | [`src/terminal/features/`](../../../packages/tui/src/terminal/features) | Capability detection, keyboard protocol negotiation, hyperlinks, and color queries |
| Components | [`src/components/`](../../../packages/tui/src/components) | Reusable visual widgets, containers, selectors, messages, receipts, HUD, and status line |
| Editor | [`src/editor/`](../../../packages/tui/src/editor) | Text editing state, undo, navigation, autocomplete, and reusable editor contracts |
| Input | [`src/input/`](../../../packages/tui/src/input) | Keyboard decoding, keybindings, sequence buffering, and input normalization |
| Theme | [`src/theme/`](../../../packages/tui/src/theme) | Theme schemas/files, color resolution/downshifting, active theme, and syntax highlighting |
| Utilities | [`src/utilities/`](../../../packages/tui/src/utilities) | ANSI-safe width, wrap, truncate, slice, stripping, and diff primitives |

## Input and render flow

```text
process.stdin
  -> ProcessTerminal
  -> StdinBuffer and keyboard decoding
  -> TUI global listeners
  -> focused Component.handleInput()
  -> component invalidation / TUI.requestRender()
  -> Component.render(width) line arrays
  -> base tree plus overlays
  -> width validation and cursor-marker resolution
  -> frame diff
  -> synchronized process.stdout update
```

Every visible component line must fit the width supplied to `render(width)`. TUI treats violations as rendering errors. The cursor is represented by an invisible marker in component output and resolved after the composed frame is built.

## Dependencies

### Workspace

None.

### External runtime

| Dependency | Why it is used |
|---|---|
| `beautiful-mermaid` | Terminal Mermaid rendering |
| `chalk` | ANSI styling and color conversion |
| `diff` | Intra-line diff computation |
| `get-east-asian-width` | Terminal column width calculation |
| `marked` | Markdown tokenization |
| `highlight.js` | Syntax highlighting |
| `typebox` | Theme schema construction and validation |

`@xterm/headless` is a development dependency. The current public source exposes `ProcessTerminal`; it does not expose a `VirtualTerminal` implementation.

## Interactions with other packages

| Consumer | Contract |
|---|---|
| `@tsuuanmi/pi` | Creates `ProcessTerminal` and `TUI`, composes application screens and dialogs, initializes themes/keybindings, exposes selected component/theme/overlay contracts to extensions, and supplies status/session data |
| `@tsuuanmi/pi-workflows` | Produces and normalizes HUD summary data and requests refresh; Pi reads session workflow state and provides it to TUI's status-line component |

TUI callbacks can invoke host behavior, but TUI does not import the host. This keeps rendering and application policy in opposite directions: Pi owns meaning; TUI owns terminal presentation.

## State and lifecycle

TUI has process-local render, focus, overlay, input, and theme state. It reads packaged theme assets and may query terminal/git status through injected or low-level adapters, but it does not own application persistence.

`ProcessTerminal.start()` changes raw mode and terminal protocol state. Hosts must pair it with orderly stop/dispose behavior so raw mode, cursor state, paste mode, and keyboard negotiation are restored.

## Extension points

- Implement `Component` and optionally `Focusable` or `EditorComponent`.
- Compose children through `Container` or mount overlays through TUI handles.
- Register global input listeners and request coalesced rerenders.
- Supply an `AutocompleteProvider`.
- Extend keybinding actions through TypeScript declaration merging and runtime configuration.
- Load custom themes or supply component-specific theme callbacks.
- Inject status-line session/data providers and workflow HUD readers.
- Override cached terminal capabilities for constrained hosts and tests.

## Runtime constraints

- ESM; Node.js 22.19 or newer.
- Published for Linux and macOS.
- Assumes ANSI/CSI/OSC terminal behavior and real stdin/stdout for `ProcessTerminal`.
- Uses modern `Intl.Segmenter` and Unicode regular-expression features for width calculations.
- Theme JSON assets must be copied to `dist/theme` during build.
