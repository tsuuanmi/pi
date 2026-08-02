import { initTheme, ProcessTerminal, TUI } from "@tsuuanmi/pi-tui";
import type { ResolvedPaths } from "#pi/package-manager/package-manager";
import type { SettingsManager } from "#pi/settings/settings-manager";
import { ResourceSelector } from "#pi/ui/package-manager/resource-selector";

export interface ConfigSelectorOptions {
	resolvedPaths: ResolvedPaths;
	settingsManager: SettingsManager;
	cwd: string;
	agentDir: string;
}

export async function selectConfig(options: ConfigSelectorOptions): Promise<void> {
	initTheme(options.settingsManager.getTheme());

	return new Promise((resolve) => {
		const ui = new TUI(new ProcessTerminal());
		let resolved = false;

		const selector = new ResourceSelector(
			options.resolvedPaths,
			options.settingsManager,
			options.cwd,
			options.agentDir,
			() => {
				if (!resolved) {
					resolved = true;
					ui.stop();
					resolve();
				}
			},
			() => {
				ui.stop();
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
