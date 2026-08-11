/**
 * Utilities for formatting keybinding hints in terminal UI.
 */

import type { Keybinding, KeybindingsManager } from "#tui/input/keyboard/keybindings";
import type { KeyId } from "#tui/input/keyboard/keys";
import { theme } from "#tui/theme/theme";

export interface KeyTextFormatOptions {
	capitalize?: boolean;
}

function formatKeyPart(part: string, options: KeyTextFormatOptions): string {
	const displayPart = process.platform === "darwin" && part.toLowerCase() === "alt" ? "option" : part;
	return options.capitalize ? displayPart.charAt(0).toUpperCase() + displayPart.slice(1) : displayPart;
}

export function formatKeyText(key: string, options: KeyTextFormatOptions = {}): string {
	return key
		.split("/")
		.map((k) =>
			k
				.split("+")
				.map((part) => formatKeyPart(part, options))
				.join("+"),
		)
		.join("/");
}

function formatKeys(keys: KeyId[], options: KeyTextFormatOptions = {}): string {
	if (keys.length === 0) return "";
	return formatKeyText(keys.join("/"), options);
}

export function keyText(keybindings: KeybindingsManager, keybinding: Keybinding): string {
	return formatKeys(keybindings.getKeys(keybinding));
}

export function keyDisplayText(keybindings: KeybindingsManager, keybinding: Keybinding): string {
	return formatKeys(keybindings.getKeys(keybinding), { capitalize: true });
}

export function keyHint(keybindings: KeybindingsManager, keybinding: Keybinding, description: string): string {
	return theme.fg("dim", keyText(keybindings, keybinding)) + theme.fg("muted", ` ${description}`);
}

export function rawKeyHint(key: string, description: string): string {
	return theme.fg("dim", formatKeyText(key)) + theme.fg("muted", ` ${description}`);
}
