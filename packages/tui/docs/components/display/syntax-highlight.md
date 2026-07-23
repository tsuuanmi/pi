# Syntax Highlight

Wrapper around `highlight.js` that turns highlighted HTML into ANSI-styled terminal output.

```typescript
type HighlightFormatter = (text: string) => string;
type HighlightTheme = Partial<Record<string, HighlightFormatter>>;
interface HighlightOptions {
  language?: string;
  ignoreIllegals?: boolean;
  languageSubset?: string[];
  theme?: HighlightTheme;
}

function highlight(code: string, options?: HighlightOptions): string;
function renderHighlightedHtml(html: string, theme?: HighlightTheme): string;
function supportsLanguage(name: string): boolean;
```

## `highlight`

- When `language` is set, uses `hljs.highlight(code, { language, ignoreIllegals })`.
- Otherwise uses `hljs.highlightAuto(code, languageSubset)`.
- The resulting HTML is passed through `renderHighlightedHtml` with `options.theme`.

## `renderHighlightedHtml`

Walks the HTML string, tracking a stack of open scopes. Each `<span class="hljs-...">` pushes a scope and each `</span>` pops one.

Scope lookup tries, in order:

1. The exact scope name.
2. The dot-prefix.
3. The dash-prefix.
4. `theme.default`.

## `supportsLanguage`

Returns whether `hljs.getLanguage(name)` is defined. Used by [Theme](../../theme/index.md) `highlightCode` to decide whether to highlight or fall back to plain code.
