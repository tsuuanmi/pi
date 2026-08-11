# Keybindings

Typed, host-scoped keybinding definitions and matching for terminal components.

```typescript
import {
  KeybindingsManager,
  TUI_KEYBINDINGS,
  type Keybinding,
  type KeybindingDefinitions,
  type KeybindingsConfig,
} from "@tsuuanmi/pi-tui";
```

## Definitions

`TUI_KEYBINDINGS` contains the shared `tui.*` actions used by reusable components. Each definition has a description, default keys, and optional category.

```typescript
const definitions = {
  ...TUI_KEYBINDINGS,
  "app.open": { defaultKeys: "ctrl+o", description: "Open" },
} satisfies KeybindingDefinitions;
```

Applications can extend the compile-time registry through declaration merging:

```typescript
declare module "@tsuuanmi/pi-tui" {
  interface Keybindings {
    "app.open": null;
  }
}
```

## Manager

Each UI host creates its own manager and injects the same instance into components that handle input or render configured hints.

```typescript
const keybindings = new KeybindingsManager(definitions, userBindings);

keybindings.matches(data, "tui.select.cancel");
keybindings.getKeys("app.open");
keybindings.getDefinition("app.open");
keybindings.getConflicts();
```

There is no active global manager. TUI does not export `getKeybindings()` or `setKeybindings()`, and interactive components do not create fallback managers.

## User bindings

`KeybindingsConfig` maps action ids to one key, multiple keys, or an empty array to unbind the action.

```typescript
const userBindings: KeybindingsConfig = {
  "app.open": ["ctrl+p", "f2"],
  "tui.select.cancel": [],
};

keybindings.setUserBindings(userBindings);
```

The manager normalizes aliases, resolves user overrides against defaults, and reports conflicts where one key maps to multiple actions.

## Component injection

Interactive primitives require the manager they use:

```typescript
const input = new Input(keybindings);
const editor = new Editor(tui, editorTheme, keybindings);
const list = new SelectList(keybindings, items, 10, listTheme);
```

Application adapters should accept a manager in their constructor or options and pass it unchanged to nested TUI primitives. This keeps handled input and displayed hints scoped to one host.

## See also

- [Keybinding hints](keybinding-hints.md)
- [Key detection](keys.md)
