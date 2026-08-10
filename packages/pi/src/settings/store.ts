import { parseSettings, serializeSettings } from "#pi/settings/codec";
import { loadSettings } from "#pi/settings/load";
import { mergeChanged, mergeSettings } from "#pi/settings/merge";
import { MemoryStorage } from "#pi/settings/storage";
import type { Settings, SettingsScope, SettingsStorage } from "#pi/settings/types";

type Field = keyof Settings;
type Update = (settings: Settings) => void;

function fields(value: Field | readonly Field[]): readonly Field[] {
	return Array.isArray(value) ? (value as readonly Field[]) : [value as Field];
}

function changes(field: Field | readonly Field[], nestedKey?: string): [Set<Field>, Map<Field, Set<string>>] {
	const modified = new Set(fields(field));
	const nested = new Map<Field, Set<string>>();
	if (nestedKey) {
		for (const name of modified) nested.set(name, new Set([nestedKey]));
	}
	return [modified, nested];
}

export class SettingsStore {
	private readonly storage: SettingsStorage;
	private globalSettings: Settings;
	private projectSettings: Settings;
	private settings: Settings;

	private constructor(storage: SettingsStorage, globalSettings: Settings, projectSettings: Settings) {
		this.storage = storage;
		this.globalSettings = globalSettings;
		this.projectSettings = projectSettings;
		this.settings = mergeSettings(globalSettings, projectSettings);
	}

	static fromStorage(storage: SettingsStorage): SettingsStore {
		return new SettingsStore(storage, loadSettings(storage, "global"), loadSettings(storage, "project"));
	}

	static inMemory(settings: Partial<Settings> = {}): SettingsStore {
		const storage = new MemoryStorage();
		storage.update("global", () => serializeSettings(structuredClone(settings)));
		return SettingsStore.fromStorage(storage);
	}

	getSettings(): Settings {
		return structuredClone(this.settings);
	}

	getGlobalSettings(): Settings {
		return structuredClone(this.globalSettings);
	}

	getProjectSettings(): Settings {
		return structuredClone(this.projectSettings);
	}

	applyOverrides(overrides: Partial<Settings>): void {
		this.settings = mergeSettings(this.settings, overrides);
	}

	reload(): void {
		const globalSettings = loadSettings(this.storage, "global");
		const projectSettings = loadSettings(this.storage, "project");
		this.globalSettings = globalSettings;
		this.projectSettings = projectSettings;
		this.settings = mergeSettings(globalSettings, projectSettings);
	}

	updateGlobal(field: Field | readonly Field[], update: Update, nestedKey?: string): void {
		const next = structuredClone(this.globalSettings);
		update(next);
		const [modified, nested] = changes(field, nestedKey);
		this.persist("global", next, modified, nested);
		this.globalSettings = next;
		this.settings = mergeSettings(this.globalSettings, this.projectSettings);
	}

	updateProject(field: Field, update: Update): void {
		const next = structuredClone(this.projectSettings);
		update(next);
		const [modified, nested] = changes(field);
		this.persist("project", next, modified, nested);
		this.projectSettings = next;
		this.settings = mergeSettings(this.globalSettings, this.projectSettings);
	}

	private persist(
		scope: SettingsScope,
		snapshot: Settings,
		modified: Set<Field>,
		nested: Map<Field, Set<string>>,
	): void {
		this.storage.update(scope, (current) => {
			const stored = current === undefined ? {} : parseSettings(current, `${scope} settings`);
			return serializeSettings(mergeChanged(stored, snapshot, modified, nested));
		});
	}
}
