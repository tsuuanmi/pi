import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolvePath } from "@tsuuanmi/pi-agent/node";
import { loadThemeFromPath, type Theme } from "@tsuuanmi/pi-tui";
import type { ResourceDiagnostic } from "#pi/resources/diagnostics";
import type { ResolvedResource } from "#pi/resources/types";

export interface ThemeResult {
	themes: Theme[];
	diagnostics: ResourceDiagnostic[];
}

export function loadThemes(resources: ResolvedResource[], cwd: string): ThemeResult {
	const themes: Theme[] = [];
	const diagnostics: ResourceDiagnostic[] = [];

	for (const resource of resources) {
		const resolved = resolvePath(resource.path, cwd, { trim: true });
		if (!existsSync(resolved)) {
			diagnostics.push({ type: "warning", message: "theme path does not exist", path: resolved });
			continue;
		}

		try {
			const stats = statSync(resolved);
			if (stats.isDirectory()) {
				loadThemeDirectory(resolved, themes, diagnostics);
			} else if (stats.isFile() && resolved.endsWith(".json")) {
				loadThemeFile(resolved, themes, diagnostics);
			} else {
				diagnostics.push({ type: "warning", message: "theme path is not a json file", path: resolved });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to read theme path";
			diagnostics.push({ type: "warning", message, path: resolved });
		}
	}

	return { themes, diagnostics };
}

function loadThemeDirectory(dir: string, themes: Theme[], diagnostics: ResourceDiagnostic[]): void {
	if (!existsSync(dir)) return;

	try {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			let isFile = entry.isFile();
			const filePath = join(dir, entry.name);
			if (entry.isSymbolicLink()) {
				try {
					isFile = statSync(filePath).isFile();
				} catch {
					continue;
				}
			}
			if (isFile && entry.name.endsWith(".json")) loadThemeFile(filePath, themes, diagnostics);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to read theme directory";
		diagnostics.push({ type: "warning", message, path: dir });
	}
}

function loadThemeFile(filePath: string, themes: Theme[], diagnostics: ResourceDiagnostic[]): void {
	try {
		themes.push(loadThemeFromPath(filePath));
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to load theme";
		diagnostics.push({ type: "warning", message, path: filePath });
	}
}
