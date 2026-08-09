import type { Settings } from "#pi/settings/types";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSettings(content: string): Settings {
	const value: unknown = JSON.parse(content);
	if (!isRecord(value)) {
		throw new Error("Settings must be a JSON object");
	}
	return value as Settings;
}

export function serializeSettings(settings: Settings): string {
	return JSON.stringify(settings, null, 2);
}
