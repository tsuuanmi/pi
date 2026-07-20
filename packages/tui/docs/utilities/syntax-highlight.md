# Syntax Highlight

Wrapper around `highlight.js` that converts highlight.js HTML output (nested `<span class="hljs-...">` tags) into ANSI-styled text using a configurable scope-to-formatter theme.

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

Walks the HTML string, tracking a stack of open scopes (each `<span class="hljs-...">` pushes a scope, each `</span>` pops one). Text is flushed through the active formatter, where the active formatter is the nearest ancestor scope that has a matching entry in the theme.

Scope lookup (`getScopeFormatter`) tries, in order:

1. The exact scope name (e.g. `title.function`).
2. The dot-prefix (e.g. `title.function` → `title`).
3. The dash-prefix (e.g. `title-function` → `title`).
4. Falls back to `theme.default` when no ancestor matches.

## `supportsLanguage`

Returns whether `hljs.getLanguage(name)` is defined. Used by [Theme](../theme/index.md) `highlightCode` to decide whether to highlight or fall back to plain `mdCodeBlock` lines (auto-detection is intentionally skipped to avoid misidentifying prose).

## See Also

- [Theme](../theme/index.md) — `highlightCode`, `getLanguageFromPath`, and the built-in CLI highlight theme.