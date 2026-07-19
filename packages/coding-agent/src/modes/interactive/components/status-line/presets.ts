import type { PresetDef, StatusLinePreset } from "#coding-agent/modes/interactive/components/status-line/types";

/**
 * Built-in status line presets. Only the 10 Pi segment ids are used
 * (model, mode, git, path, context_pct, context_total, token_in, token_out,
 * session_name, subagents). `thinking` is a folded option of `model`, not a
 * separate segment.
 */
export const STATUS_LINE_PRESETS: Record<StatusLinePreset, PresetDef> = {
	default: {
		leftSegments: ["model", "mode", "git", "path"],
		rightSegments: ["session_name", "subagents", "token_in", "token_out", "context_pct", "context_total"],
		separator: "slash",
		segmentOptions: {
			model: { showThinkingLevel: true, showProviderPrefix: true },
			path: { abbreviate: true, maxLength: 40, stripWorkPrefix: false },
			git: { showBranch: true, showStaged: true, showUnstaged: true, showUntracked: true },
		},
	},
	// `custom` mirrors `default` and is the home for user overrides applied via
	// the other `StatusLineSettings` fields (leftSegments/rightSegments/etc.).
	custom: {
		leftSegments: ["model", "mode", "git", "path"],
		rightSegments: ["session_name", "subagents", "token_in", "token_out", "context_pct", "context_total"],
		separator: "slash",
		segmentOptions: {
			model: { showThinkingLevel: true, showProviderPrefix: true },
			path: { abbreviate: true, maxLength: 40, stripWorkPrefix: false },
			git: { showBranch: true, showStaged: true, showUnstaged: true, showUntracked: true },
		},
	},
};

export function getPreset(name: StatusLinePreset | undefined): PresetDef {
	return STATUS_LINE_PRESETS[name ?? "default"] ?? STATUS_LINE_PRESETS.default;
}
