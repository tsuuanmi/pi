import { initTheme, ProcessTerminal, TUI } from "@tsuuanmi/pi-tui";
import type { ResolvedPaths } from "#pi/resources/types";
import type { SettingsManager } from "#pi/settings/settings-manager";
import { ResourceSettingsComponent } from "#pi/ui/package/settings";

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

		const selector = new ResourceSettingsComponent(
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
