# Theme

Theme loading, the active theme instance, terminal-background detection, and per-component theme adapters.

The module lives under `src/theme/` and is re-exported from the package root (`export * from "#tui/theme/theme"`). Built-in theme JSON files live alongside the source (`src/theme/dark.json`, `src/theme/light.json`) and the schema is `src/theme/theme-schema.json` (see [Theme Schema](theme-schema.md)).

## The active theme

`theme` is a `Theme` instance exposed through a `Proxy` that reads from a `globalThis` symbol so every module loader (tsx, jiti) sees the same theme. It throws when accessed before `initTheme()`.

### Lifecycle

```typescript
function initTheme(themeName?: string, enableWatcher?: boolean): void;
function setTheme(name: string, enableWatcher?: boolean): { success: boolean; error?: string };
function setThemeInstance(themeInstance: Theme): void;
function setRegisteredThemes(themes: Theme[]): void;
function onThemeChange(callback: () => void): void;
function stopThemeWatcher(): void;
```

- `initTheme` — load the named theme (defaults to detected terminal background); on any error falls back to `dark` silently. Optionally starts a file watcher for custom themes.
- `setTheme` — switch theme at runtime, returns `{ success, error? }`, and calls the change callback on success. Falls back to `dark` on failure.
- `setThemeInstance` — install an in-memory `Theme` directly (cannot be file-watched).
- `onThemeChange` — register a single redraw callback invoked on `setTheme`/`setThemeInstance`/watcher reloads.
- `stopThemeWatcher` — stops the custom-theme file watcher and clears the reload timer.

The watcher only runs for custom themes (not `dark`/`light`), debounces reloads by 100ms, keeps the last valid theme on a transient invalid file, and refreshes the registry cache on successful reload.

### Lookup

```typescript
function getAvailableThemes(): string[];
function getAvailableThemesWithPaths(): ThemeInfo[];
function getThemeByName(name: string): Theme | undefined;
function loadThemeFromPath(themePath: string, mode?: ColorMode): Theme;
```

`ThemeInfo` exposes `{ name, path }`. Themes are discovered from the built-in directory and the user's custom themes directory.

## Theme class

The `Theme` class wraps a resolved color map and exposes styling helpers. All methods emit ANSI SGR sequences; colors are downshifted to 256-color when the terminal does not advertise truecolor.

```typescript
type ThemeColor = /* 46 named color tokens — see below */;
type ThemeBg = "selectedBg" | "userMessageBg" | "customMessageBg" | "toolPendingBg" | "toolSuccessBg" | "toolErrorBg";
```

Key methods:

- `fg(color: ThemeColor, text: string): string` — foreground color.
- `bg(color: ThemeBg, text: string): string` — background color.
- `bold`, `italic`, `underline`, `inverse`, `strikethrough` — text attributes.
- Color resolution honors the active `ColorMode` (`truecolor` | `256color`).

### Color tokens (`ThemeColor`)

`accent`, `border`, `borderAccent`, `borderMuted`, `success`, `error`, `warning`, `muted`, `dim`, `text`, `thinkingText`, `userMessageText`, `customMessageText`, `customMessageLabel`, `toolTitle`, `toolOutput`, `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet`, `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext`, `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation`, `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`, `bashMode`.

## Terminal background detection

Used to pick `dark` vs `light` automatically.

```typescript
type TerminalTheme = "dark" | "light";
interface TerminalThemeDetection { theme: TerminalTheme; source: "terminal background" | "COLORFGBG" | "fallback"; detail: string; confidence: "high" | "low"; }

function getThemeForRgbColor(rgb: RgbColor): TerminalTheme;
function detectTerminalBackgroundFromEnv(options?: TerminalThemeDetectionOptions): TerminalThemeDetection;
function detectTerminalBackgroundTheme(options: TerminalBackgroundThemeDetectionOptions): Promise<TerminalThemeDetection>;
```

- `getThemeForRgbColor` — luminance threshold `>= 0.5` → `light`, else `dark`.
- `detectTerminalBackgroundFromEnv` — parses `$COLORFGBG` background index (high confidence); falls back to `dark` (low confidence) when absent.
- `detectTerminalBackgroundTheme` — queries OSC 11 via the injected `ui.queryTerminalBackgroundColor` (high confidence), then falls back to env detection.

256-color indices are converted to RGB via the standard 6×6×6 cube and grayscale ramp (`ansi256ToHex`).

## Syntax highlighting + code helpers

```typescript
function highlightCode(code: string, lang?: string): string[];
function getLanguageFromPath(filePath: string): string | undefined;
```

- `highlightCode` — highlights `code` with the active theme's syntax tokens via [Syntax Highlight](../components/display/syntax-highlight.md). When `lang` is missing or unsupported, returns each line colored as `mdCodeBlock` (no auto-detection, to avoid cli-highlight misidentifying prose). Never throws — on error, returns plain `mdCodeBlock`-colored lines.
- `getLanguageFromPath` — maps a file extension to a language id (`ts` → `typescript`, `py` → `python`, `rs` → `rust`, ...). Returns `undefined` for unknown/no extension.

## Per-component theme adapters

These build a component-specific theme object bound to the active `theme`:

```typescript
function getMarkdownTheme(): MarkdownTheme;
function getSelectListTheme(): SelectListTheme;
function getEditorTheme(): EditorTheme;
function getSettingsListTheme(): SettingsListTheme;
```

Adapters map component hooks (`heading`, `selectedText`, `borderColor`, `cursor`, ...) to the relevant `ThemeColor` tokens. See the corresponding components in [Components](../components/index.md).

## See Also

- [Theme Schema](theme-schema.md) — the JSON shape theme files must satisfy.
- [Syntax Highlight](../components/display/syntax-highlight.md) — the lower-level highlighter used by `highlightCode`.
- [Components](../components/index.md) — component theme adapters.