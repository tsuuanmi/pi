import * as os from "node:os";
import { pathToFileURL } from "node:url";
import { resolvePath } from "@tsuuanmi/pi-agent/node";
import type { Theme } from "@tsuuanmi/pi-tui";
import { getCapabilities, hyperlink, stripAnsi } from "@tsuuanmi/pi-tui";
import { sanitizeBinaryOutput } from "#pi/output/sanitize";

export function shortenPath(path: unknown): string {
	if (typeof path !== "string") return "";
	const home = os.homedir();
	return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function linkPath(styledText: string, rawPath: string, cwd: string): string {
	if (!getCapabilities().hyperlinks) return styledText;
	return hyperlink(styledText, pathToFileURL(resolvePath(rawPath, cwd)).href);
}

export function str(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (value == null) return "";
	return null;
}

export function replaceTabs(text: string): string {
	return text.replace(/\t/g, "   ");
}

export function normalizeDisplayText(text: string): string {
	return text.replace(/\r/g, "");
}

export function getTextOutput(result: { content: Array<{ type: string; text?: string }> } | undefined): string {
	if (!result) return "";
	return result.content
		.filter((content) => content.type === "text")
		.map((content) => sanitizeBinaryOutput(stripAnsi(content.text || "")).replace(/\r/g, ""))
		.join("\n");
}

export function invalidArgText(theme: Theme): string {
	return theme.fg("error", "[invalid arg]");
}

export function renderToolPath(
	rawPath: string | null,
	theme: Theme,
	cwd: string,
	options?: { emptyFallback?: string },
): string {
	if (rawPath === null) return invalidArgText(theme);
	const value = rawPath || options?.emptyFallback;
	if (!value) return theme.fg("toolOutput", "...");
	return linkPath(theme.fg("dim", shortenPath(value)), value, cwd);
}
