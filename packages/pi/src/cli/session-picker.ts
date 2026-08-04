/**
 * TUI session selector for --resume flag
 */

import { ProcessTerminal, setKeybindings, TUI } from "@tsuuanmi/pi-tui";
import type { SessionInfo, SessionListPage, SessionListProgress } from "#pi/session/manager";
import { KeybindingsManager } from "#pi/settings/keybindings";
import { SessionSelectorComponent } from "#pi/ui/interactive/components/selectors/session";

type SessionsLoader = (
	onProgress?: SessionListProgress,
	offset?: number,
	limit?: number,
) => Promise<SessionInfo[] | SessionListPage>;

/** Show TUI session selector and return selected session path or null if cancelled */
export async function selectSession(
	currentSessionsLoader: SessionsLoader,
	allSessionsLoader: SessionsLoader,
): Promise<string | null> {
	return new Promise((resolve) => {
		const ui = new TUI(new ProcessTerminal());
		const keybindings = KeybindingsManager.create();
		setKeybindings(keybindings);
		let resolved = false;

		const selector = new SessionSelectorComponent(
			currentSessionsLoader,
			allSessionsLoader,
			(path: string) => {
				if (!resolved) {
					resolved = true;
					ui.stop();
					resolve(path);
				}
			},
			() => {
				if (!resolved) {
					resolved = true;
					ui.stop();
					resolve(null);
				}
			},
			() => {
				ui.stop();
				process.exit(0);
			},
			() => ui.requestRender(),
			{ showRenameHint: false, keybindings },
		);

		ui.addChild(selector);
		ui.setFocus(selector.getSessionList());
		ui.start();
	});
}
