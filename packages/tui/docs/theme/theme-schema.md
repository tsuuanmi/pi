# Theme Schema

The JSON schema every theme file must satisfy. Defined in `src/theme/theme-schema.json` (TypeBox) and shipped to `dist/theme/theme-schema.json`.

## Top-level shape

```jsonc
{
  "$schema": "...",
  "name": "Theme name",            // required
  "vars": { "key": "..." },         // optional, see below
  "colors": { ... }                 // required — all color tokens (see below)
}
```

Top-level `required`: `["name", "colors"]`.

## Color values (`$defs.colorValue`)

Each color token accepts one of:

- a **string** — `#RRGGBB` hex, a variable reference (into `vars`), or an empty string for the terminal default; or
- an **integer** `0–255` — a 256-color palette index.

## `vars` (optional)

A free-form object of named color values reusable via reference. Each value follows `colorValue` (string hex/palette index, or empty for default).

## `colors` (required)

All of the following keys are required. They mirror the `ThemeColor` and `ThemeBg` unions in [Theme](index.md):

`accent`, `border`, `borderAccent`, `borderMuted`, `success`, `error`, `warning`, `muted`, `dim`, `text`, `thinkingText`, `selectedBg`, `userMessageBg`, `userMessageText`, `customMessageBg`, `customMessageText`, `customMessageLabel`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, `toolTitle`, `toolOutput`, `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet`, `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext`, `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation`, `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`, `bashMode`.

## Built-in themes

Two built-in themes ship as JSON and are copied to `dist/theme/` on build:

- `src/theme/dark.json`
- `src/theme/light.json`

## See Also

- [Theme](index.md) — loading and the active `theme` instance.