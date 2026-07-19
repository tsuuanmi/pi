/**
 * TUI config selector for `pi config` command
 */

import { ProcessTerminal, TUI } from "@tsuuanmi/pi-tui";
import type { ResolvedPaths } from "#coding-agent/core/package-manager/package-manager";
import type { SettingsManager } from "#coding-agent/core/settings/settings-manager";
import { ConfigSelectorComponent } from "#coding-agent/modes/interactive/components/selectors/config-selector";
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
