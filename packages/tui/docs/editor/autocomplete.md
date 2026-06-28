# Autocomplete

The TUI framework provides autocomplete support for slash commands and file paths, with fuzzy matching.

## CombinedAutocompleteProvider

Combine slash commands and file path completion:

```typescript
import { CombinedAutocompleteProvider } from "@tsuuanmi/pi-tui";

const provider = new CombinedAutocompleteProvider(
  [
    { name: "help", description: "Show help" },
    { name: "clear", description: "Clear screen" },
    { name: "delete", description: "Delete last message" },
  ],
  process.cwd() // base path for file completion
);

editor.setAutocompleteProvider(provider);
```

**Features:**

- Type `/` to see slash commands
- Press `Tab` for file path completion
- Works with `~/`, `./`, `../`, and `@` prefix
- `@` prefix filters to attachable files
- Fuzzy matching for both commands and paths

## Autocomplete Interface

```typescript
interface AutocompleteItem {
  name: string;
  description?: string;
}

interface AutocompleteSuggestions {
  items: AutocompleteItem[];
  startIndex: number;  // Start position of the matched text
  endIndex: number;    // End position of the matched text
}

interface AutocompleteProvider {
  getSuggestions(text: string, cursorPosition: number): AutocompleteSuggestions | null;
}
```

Implement the `AutocompleteProvider` interface for custom autocomplete:

```typescript
class MyAutocompleteProvider implements AutocompleteProvider {
  getSuggestions(text: string, cursorPosition: number): AutocompleteSuggestions | null {
    const beforeCursor = text.slice(0, cursorPosition);
    const match = beforeCursor.match(/@(\w*)$/);
    if (!match) return null;

    const prefix = match[1];
    const items = this.getItems().filter(item =>
      item.name.toLowerCase().startsWith(prefix.toLowerCase())
    );

    return {
      items,
      startIndex: cursorPosition - prefix.length - 1, // -1 for @
      endIndex: cursorPosition,
    };
  }
}
```

## File Path Completion

File path completion supports:

- Absolute paths: `/usr/local/bin/`
- Home directory: `~/Documents/`
- Relative paths: `./src/`, `../`
- `@` prefix: filters to attachable files (determined by the provider)

File completions use `fs.readdirSync` and `fs.statSync` for directory listing and support nested path completion.

## Fuzzy Matching

The `fuzzyFilter` and `fuzzyMatch` utilities provide fuzzy string matching:

```typescript
import { fuzzyFilter, fuzzyMatch } from "@tsuuanmi/pi-tui";

// Check if a string fuzzy-matches a query
const result = fuzzyMatch("hw", "Hello World");
// { matches: true, score: -5 }

// Filter an array of items by fuzzy match
const filtered = fuzzyFilter("test", [
  { name: "test-file", score: 0 },
  { name: "another", score: 0 },
], item => item.name);
```

Fuzzy matching rules:

- All query characters must appear in order (not necessarily consecutive)
- Lower score = better match
- Consecutive matches are rewarded
- Word boundary matches are rewarded
- Gaps between matches are penalized
- Exact matches get the highest bonus