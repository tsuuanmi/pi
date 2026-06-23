import { execSync } from "node:child_process";

export interface TerminalCapabilities {
	trueColor: boolean;
	hyperlinks: boolean;
}

let cachedCapabilities: TerminalCapabilities | null = null;

/**
 * Checks whether the attached tmux client forwards OSC 8 hyperlinks to the
 * outer terminal. tmux only re-emits them when its `client_termfeatures` lists
 * `hyperlinks`, and strips them otherwise. On any error fallbacks `false`.
 */
function probeTmuxHyperlinks(): boolean {
	try {
		const termfeatures = execSync("tmux display-message -p '#{client_termfeatures}'", {
			encoding: "utf8",
			timeout: 250,
			stdio: ["ignore", "pipe", "ignore"],
		});
		return termfeatures
			.split(",")
			.map((feature) => feature.trim())
			.includes("hyperlinks");
	} catch {
		return false;
	}
}

export function detectCapabilities(tmuxForwardsHyperlink: () => boolean = probeTmuxHyperlinks): TerminalCapabilities {
	const termProgram = process.env.TERM_PROGRAM?.toLowerCase() || "";
	const terminalEmulator = process.env.TERMINAL_EMULATOR?.toLowerCase() || "";
	const term = process.env.TERM?.toLowerCase() || "";
	const colorTerm = process.env.COLORTERM?.toLowerCase() || "";
	const hasTrueColorHint = colorTerm === "truecolor" || colorTerm === "24bit";

	// Emit OSC 8 hyperlinks only when tmux confirms it forwards.
	if (process.env.TMUX || term.startsWith("tmux")) {
		return { trueColor: hasTrueColorHint, hyperlinks: tmuxForwardsHyperlink() };
	}

	// screen does not forward OSC 8 hyperlinks, so keep them off there.
	if (term.startsWith("screen")) {
		return { trueColor: hasTrueColorHint, hyperlinks: false };
	}

	if (process.env.KITTY_WINDOW_ID || termProgram === "kitty") {
		return { trueColor: true, hyperlinks: true };
	}

	if (termProgram === "ghostty" || term.includes("ghostty") || process.env.GHOSTTY_RESOURCES_DIR) {
		return { trueColor: true, hyperlinks: true };
	}

	if (process.env.WEZTERM_PANE || termProgram === "wezterm") {
		return { trueColor: true, hyperlinks: true };
	}

	if (process.env.ITERM_SESSION_ID || termProgram === "iterm.app") {
		return { trueColor: true, hyperlinks: true };
	}

	if (termProgram === "vscode") {
		return { trueColor: true, hyperlinks: true };
	}

	if (termProgram === "alacritty") {
		return { trueColor: true, hyperlinks: true };
	}

	if (terminalEmulator === "jetbrains-jediterm") {
		return { trueColor: true, hyperlinks: false };
	}

	// Unknown terminal: be conservative. OSC 8 is rendered invisibly as "just
	// text" on terminals that swallow it, which means the URL disappears from
	// the rendered output. Default to the legacy `text (url)` behavior unless we
	// have positively identified a hyperlink-capable terminal above.
	return { trueColor: hasTrueColorHint, hyperlinks: false };
}

export function getCapabilities(): TerminalCapabilities {
	if (!cachedCapabilities) {
		cachedCapabilities = detectCapabilities();
	}
	return cachedCapabilities;
}

export function resetCapabilitiesCache(): void {
	cachedCapabilities = null;
}

/** Override the cached capabilities. Useful in tests to exercise both code paths. */
export function setCapabilities(caps: TerminalCapabilities): void {
	cachedCapabilities = caps;
}

/**
 * Wrap text in an OSC 8 hyperlink sequence.
 * The text is rendered as a clickable hyperlink in terminals that support OSC 8
 * (Ghostty, Kitty, WezTerm, iTerm2, VSCode, and others).
 * In terminals that do not support OSC 8, the escape sequences are ignored
 * and only the plain text is displayed.
 *
 * @param text - The visible text to display
 * @param url - The URL to link to
 */
export function hyperlink(text: string, url: string): string {
	return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}
