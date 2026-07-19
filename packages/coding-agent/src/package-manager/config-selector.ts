/**
 * TUI config selector for `pi config` command
 */

import { ProcessTerminal, TUI } from "@tsuuanmi/pi-tui";
import { ConfigSelectorComponent } from "#coding-agent/package-manager/config-selector-component";
import type { ResolvedPaths } from "#coding-agent/package-manager/package-manager";
import type { SettingsManager } from "#coding-agent/settings/settings-manager";
import { initTheme, stopThemeWatcher } from "#coding-agent/theme/theme";

export interface ConfigSelectorOptions {
	resolvedPaths: ResolvedPaths;
	settingsManager: SettingsManager;
	cwd: string;
	agentDir: string;
}

/** Show TUI config selector and return when closed */
export async function selectConfig(options: ConfigSelectorOptions): Promise<void> {
	// Initialize theme before showing TUI
	initTheme(options.settingsManager.getTheme(), true);

	return new Promise((resolve) => {
		const ui = new TUI(new ProcessTerminal());
		let resolved = false;

		const selector = new ConfigSelectorComponent(
			options.resolvedPaths,
			options.settingsManager,
			options.cwd,
			options.agentDir,
			() => {
				if (!resolved) {
					resolved = true;
					ui.stop();
					stopThemeWatcher();
					resolve();
				}
			},
			() => {
				ui.stop();
				stopThemeWatcher();
				process.exit(0);
			},
			() => ui.requestRender(),
			ui.terminal.rows,
		);

		ui.addChild(selector);
		ui.setFocus(selector.getResourceList());
		ui.start();
	});
}
