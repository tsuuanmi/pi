import { parseSettings } from "#pi/settings/codec";
import type { Settings, SettingsScope, SettingsStorage } from "#pi/settings/types";

export interface LoadedSettings {
	settings: Settings;
	error: Error | null;
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function read(storage: SettingsStorage, scope: SettingsScope): string | undefined {
	let content: string | undefined;
	storage.withLock(scope, (current) => {
		content = current;
		return undefined;
	});
	return content;
}

export function loadSettings(storage: SettingsStorage, scope: SettingsScope): LoadedSettings {
	try {
		const content = read(storage, scope);
		return {
			settings: content === undefined ? {} : parseSettings(content),
			error: null,
		};
	} catch (error) {
		return { settings: {}, error: toError(error) };
	}
}
