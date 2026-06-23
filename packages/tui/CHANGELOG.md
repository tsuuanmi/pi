# Changelog

## [Unreleased]

### Breaking Changes

- Removed Windows-specific terminal input helper packaging and Windows Terminal key heuristics.

### Added

- Exported `sliceByColumn` for ANSI-aware horizontal column slicing.

## [0.79.6] - 2026-06-16

## [0.79.5] - 2026-06-16

### Changed

- Updated Markdown parsing to `marked` 18.0.5.

### Fixed

- Fixed editor Cursor Up handling so non-empty drafts jump to the start of the line before browsing input history ([#5789](https://github.com/tsuuanmi/pi/pull/5789) by [@4h9fbZ](https://github.com/4h9fbZ)).

## [0.79.4] - 2026-06-15

### Added

- Added terminal background color query support for OSC 11 replies ([#5385](https://github.com/tsuuanmi/pi/pull/5385) by [@vegarsti](https://github.com/vegarsti)).

### Fixed

- Fixed overlay compositing over CJK wide characters so borders stay aligned when an overlay starts inside a full-width cell ([#5297](https://github.com/tsuuanmi/pi/issues/5297)).
- Fixed WezTerm inline Kitty image rendering during full redraw fallbacks so image padding rows are reserved before the placement is drawn without regressing tall-image placement ([#5618](https://github.com/tsuuanmi/pi/issues/5618), [#4415](https://github.com/tsuuanmi/pi/issues/4415)).

## [0.79.3] - 2026-06-13

## [0.79.2] - 2026-06-12

### Fixed

- Fixed Markdown source list marker preservation to include unordered markers, so standalone `+` user messages no longer render as `-` ([#5657](https://github.com/tsuuanmi/pi/issues/5657)).
- Fixed slash-separated fuzzy queries so provider/model completions remain matchable after insertion.
- Fixed WezTerm inline Kitty image rendering so reserved row clears do not erase all but the top strip of tool image previews ([#5618](https://github.com/tsuuanmi/pi/issues/5618)).
- Fixed editor wrapping for CJK text to break at character boundaries instead of leaving large trailing gaps ([#5585](https://github.com/tsuuanmi/pi/pull/5585) by [@haoqixu](https://github.com/haoqixu)).
- Fixed loose Markdown list rendering to preserve blank-line separation between list items ([#5562](https://github.com/tsuuanmi/pi/pull/5562) by [@Perlence](https://github.com/Perlence)).

## [0.79.1] - 2026-06-09

### Added

- Added `AutocompleteProvider.triggerCharacters` so editor autocomplete can naturally trigger on provider-defined token prefixes ([#4703](https://github.com/tsuuanmi/pi/issues/4703)).

### Fixed

- Fixed IME hardware cursor positioning while slash-command autocomplete is visible ([#5283](https://github.com/tsuuanmi/pi/pull/5283) by [@smoosex](https://github.com/smoosex)).
- Fixed prompt history navigation to restore the current draft when returning from history browsing ([#5494](https://github.com/tsuuanmi/pi/issues/5494)).
- Fixed wrapping for mixed Latin and CJK text so unspaced CJK runs can break at grapheme boundaries without leaving large trailing gaps ([#5495](https://github.com/tsuuanmi/pi/issues/5495)).

## [0.79.0] - 2026-06-08

### Fixed

- Fixed prompt history navigation to place the cursor at the start when browsing upward and at the end when browsing downward, so repeated Up/Down traverses multiline prompts immediately ([#5454](https://github.com/tsuuanmi/pi/issues/5454)).
- Fixed intermittent Shift+Enter handling by making Kitty keyboard protocol fallback response-driven instead of timeout-driven ([#5188](https://github.com/tsuuanmi/pi/issues/5188)).
- Fixed TUI rendering to clear stale lines when content shrinks to zero.
- Fixed autocomplete suggestions to re-query after editor cursor movement ([#5499](https://github.com/tsuuanmi/pi/pull/5499) by [@Roman-Galeev](https://github.com/Roman-Galeev)).

## [0.78.1] - 2026-06-04

### Fixed

- Fixed overlay focus restoration so non-capturing overlays remain interactive after UI rerenders and explicit focus release ([#5235](https://github.com/tsuuanmi/pi/pull/5235) by [@nicobailon](https://github.com/nicobailon)).
- Fixed tab width accounting in column slicing and overlay compositing so tab-containing output cannot exceed the terminal width ([#5218](https://github.com/tsuuanmi/pi/issues/5218)).
