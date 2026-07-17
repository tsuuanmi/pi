# Editor Component Interface

The `EditorComponent` interface defines the contract for custom multi-line editor implementations.

## Interface

```typescript
interface EditorComponent extends Component {
  // Text access
  getText(): string;
  setText(text: string): void;

  // Callbacks
  onSubmit?: (text: string) => void;
  onChange?: (text: string) => void;

  // History support (optional)
  addToHistory?(text: string): void;

  // Advanced text manipulation (optional)
  insertTextAtCursor?(text: string): void;
  getExpandedText?(): string;

  // Autocomplete support (optional)
  setAutocompleteProvider?(provider: AutocompleteProvider): void;

  // Appearance (optional)
  borderColor?: (str: string) => string;
}
```

## Built-in Implementation

The default `Editor` component in `@tsuuanmi/pi-tui/components/editor` implements `EditorComponent` with vim-like keybindings, multi-line editing, and autocomplete support.

## Custom Implementations

To create a custom editor (e.g., emacs mode), implement `EditorComponent`:

```typescript
import { type EditorComponent, type Component } from "@tsuuanmi/pi-tui";

class EmacsEditor implements EditorComponent {
  getText(): string { return this.text; }
  setText(text: string): void { this.text = text; this.invalidate(); }
  handleInput(data: string): void { /* emacs keybindings */ }
  invalidate(): void { /* clear render cache */ }
  render(width: number): string[] { /* render lines */ }

  onSubmit?: (text: string) => void;
  onChange?: (text: string) => void;

  // Component required
  focused: boolean = false;
}
```

## See Also

- [Custom Components](../custom-components.md) - Building custom components
- [Components](../components/index.md) - Built-in components