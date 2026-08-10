import { parseSettings } from "#pi/settings/codec";
import type { Settings, SettingsScope, SettingsStorage } from "#pi/settings/types";

export function loadSettings(storage: SettingsStorage, scope: SettingsScope): Settings {
	const content = storage.read(scope);
	return content === undefined ? {} : parseSettings(content, `${scope} settings`);
}
