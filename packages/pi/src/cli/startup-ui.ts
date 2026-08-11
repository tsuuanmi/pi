import { initTheme, ProcessTerminal, TUI } from "@tsuuanmi/pi-tui";
import { KeybindingsManager } from "#pi/settings/keybindings";
import type { SettingsManager } from "#pi/settings/manager";
import { ExtensionSelectorComponent } from "#pi/ui/interactive/components/selectors/extension";

function createStartupTui(settingsManager: SettingsManager): { ui: TUI; keybindings: KeybindingsManager } {
	initTheme(settingsManager.getTheme());
	return {
		ui: new TUI(new ProcessTerminal(), settingsManager.getShowHardwareCursor()),
		keybindings: KeybindingsManager.create(),
	};
}

async function clearStartupTui(ui: TUI): Promise<void> {
	ui.clear();
	ui.requestRender();
	await new Promise((resolve) => setTimeout(resolve, 25));
}

export async function showStartupSelector<T>(
	settingsManager: SettingsManager,
	title: string,
	options: Array<{ label: string; value: T }>,
): Promise<T | undefined> {
	return new Promise((resolve) => {
		const { ui, keybindings } = createStartupTui(settingsManager);

		let settled = false;
		const finish = async (result: T | undefined) => {
			if (settled) {
				return;
			}
			settled = true;
			await clearStartupTui(ui);
			ui.stop();
			resolve(result);
		};

		const selector = new ExtensionSelectorComponent(
			title,
			options.map((option) => option.label),
			(option) => void finish(options.find((entry) => entry.label === option)?.value),
			() => void finish(undefined),
			{ tui: ui, keybindings },
		);
		ui.addChild(selector);
		ui.setFocus(selector);
		ui.start();
	});
}
