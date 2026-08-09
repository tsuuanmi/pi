import { parseSettings, serializeSettings } from "#pi/settings/codec";
import { loadSettings } from "#pi/settings/load";
import { mergeChanged, mergeSettings } from "#pi/settings/merge";
import { MemoryStorage } from "#pi/settings/storage";
import type { Settings, SettingsError, SettingsScope, SettingsStorage } from "#pi/settings/types";

type Field = keyof Settings;

type Update = (settings: Settings) => void;

function fields(value: Field | readonly Field[]): readonly Field[] {
	if (Array.isArray(value)) {
		return value as readonly Field[];
	}
	return [value as Field];
}

function copyNested(source: Map<Field, Set<string>>): Map<Field, Set<string>> {
	const copy = new Map<Field, Set<string>>();
	for (const [field, keys] of source) {
		copy.set(field, new Set(keys));
	}
	return copy;
}

function errorFrom(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}

export class SettingsStore {
	private readonly storage: SettingsStorage;
	private globalSettings: Settings;
	private projectSettings: Settings;
	private settings: Settings;
	private globalLoadError: Error | null;
	private projectLoadError: Error | null;
	private readonly modified = new Set<Field>();
	private readonly modifiedNested = new Map<Field, Set<string>>();
	private readonly modifiedProject = new Set<Field>();
	private readonly modifiedProjectNested = new Map<Field, Set<string>>();
	private writeQueue: Promise<void> = Promise.resolve();
	private errors: SettingsError[];

	private constructor(
		storage: SettingsStorage,
		globalSettings: Settings,
		projectSettings: Settings,
		globalLoadError: Error | null,
		projectLoadError: Error | null,
		initialErrors: SettingsError[],
	) {
		this.storage = storage;
		this.globalSettings = globalSettings;
		this.projectSettings = projectSettings;
		this.settings = mergeSettings(globalSettings, projectSettings);
		this.globalLoadError = globalLoadError;
		this.projectLoadError = projectLoadError;
		this.errors = [...initialErrors];
	}

	static fromStorage(storage: SettingsStorage): SettingsStore {
		const global = loadSettings(storage, "global");
		const project = loadSettings(storage, "project");
		const errors: SettingsError[] = [];
		if (global.error) {
			errors.push({ scope: "global", error: global.error });
		}
		if (project.error) {
			errors.push({ scope: "project", error: project.error });
		}
		return new SettingsStore(storage, global.settings, project.settings, global.error, project.error, errors);
	}

	static inMemory(settings: Partial<Settings> = {}): SettingsStore {
		const storage = new MemoryStorage();
		storage.withLock("global", () => serializeSettings(structuredClone(settings)));
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

	async reload(): Promise<void> {
		await this.writeQueue;

		const global = loadSettings(this.storage, "global");
		if (global.error) {
			this.globalLoadError = global.error;
			this.recordError("global", global.error);
		} else {
			this.globalSettings = global.settings;
			this.globalLoadError = null;
		}

		this.modified.clear();
		this.modifiedNested.clear();
		this.modifiedProject.clear();
		this.modifiedProjectNested.clear();

		const project = loadSettings(this.storage, "project");
		if (project.error) {
			this.projectLoadError = project.error;
			this.recordError("project", project.error);
		} else {
			this.projectSettings = project.settings;
			this.projectLoadError = null;
		}

		this.settings = mergeSettings(this.globalSettings, this.projectSettings);
	}

	updateGlobal(field: Field | readonly Field[], update: Update, nestedKey?: string): void {
		const next = structuredClone(this.globalSettings);
		update(next);
		this.globalSettings = next;
		for (const name of fields(field)) {
			this.mark("global", name, nestedKey);
		}
		this.saveGlobal();
	}

	updateProject(field: Field, update: Update): void {
		const next = structuredClone(this.projectSettings);
		update(next);
		this.projectSettings = next;
		this.mark("project", field);
		this.saveProject();
	}

	async flush(): Promise<void> {
		await this.writeQueue;
	}

	drainErrors(): SettingsError[] {
		const errors = [...this.errors];
		this.errors = [];
		return errors;
	}

	private mark(scope: SettingsScope, field: Field, nestedKey?: string): void {
		const modified = scope === "global" ? this.modified : this.modifiedProject;
		const nested = scope === "global" ? this.modifiedNested : this.modifiedProjectNested;
		modified.add(field);
		if (nestedKey) {
			const keys = nested.get(field) ?? new Set<string>();
			keys.add(nestedKey);
			nested.set(field, keys);
		}
	}

	private recordError(scope: SettingsScope, error: unknown): void {
		this.errors.push({ scope, error: errorFrom(error) });
	}

	private clearModified(scope: SettingsScope): void {
		if (scope === "global") {
			this.modified.clear();
			this.modifiedNested.clear();
		} else {
			this.modifiedProject.clear();
			this.modifiedProjectNested.clear();
		}
	}

	private enqueue(scope: SettingsScope, task: () => void): void {
		this.writeQueue = this.writeQueue
			.then(() => {
				task();
				this.clearModified(scope);
			})
			.catch((error) => {
				this.recordError(scope, error);
			});
	}

	private persist(
		scope: SettingsScope,
		snapshot: Settings,
		modified: Set<Field>,
		nested: Map<Field, Set<string>>,
	): void {
		this.storage.withLock(scope, (current) => {
			const currentSettings = current === undefined ? {} : parseSettings(current);
			const merged = mergeChanged(currentSettings, snapshot, modified, nested);
			return serializeSettings(merged);
		});
	}

	private saveGlobal(): void {
		this.settings = mergeSettings(this.globalSettings, this.projectSettings);
		if (this.globalLoadError) {
			return;
		}

		const snapshot = structuredClone(this.globalSettings);
		const modified = new Set(this.modified);
		const nested = copyNested(this.modifiedNested);
		this.enqueue("global", () => this.persist("global", snapshot, modified, nested));
	}

	private saveProject(): void {
		this.settings = mergeSettings(this.globalSettings, this.projectSettings);
		if (this.projectLoadError) {
			return;
		}

		const snapshot = structuredClone(this.projectSettings);
		const modified = new Set(this.modifiedProject);
		const nested = copyNested(this.modifiedProjectNested);
		this.enqueue("project", () => this.persist("project", snapshot, modified, nested));
	}
}
