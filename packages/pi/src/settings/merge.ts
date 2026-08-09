import type { Settings } from "#pi/settings/types";

type Field = keyof Settings;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneMerge(base: unknown, override: unknown): unknown {
	if (override === undefined) {
		return structuredClone(base);
	}

	if (isRecord(base) && isRecord(override)) {
		const result: RecordValue = {};
		for (const [key, value] of Object.entries(base)) {
			result[key] = structuredClone(value);
		}
		for (const [key, value] of Object.entries(override)) {
			if (value !== undefined) {
				result[key] = cloneMerge(result[key], value);
			}
		}
		return result;
	}

	return structuredClone(override);
}

export function mergeSettings(base: Settings, overrides: Settings): Settings {
	return cloneMerge(base, overrides) as Settings;
}

export function mergeChanged(
	current: Settings,
	snapshot: Settings,
	fields: ReadonlySet<Field>,
	nested: ReadonlyMap<Field, ReadonlySet<string>>,
): Settings {
	const result = structuredClone(current);

	for (const field of fields) {
		const value = snapshot[field];
		const nestedFields = nested.get(field);
		if (!nestedFields || !isRecord(value)) {
			(result as RecordValue)[field] = structuredClone(value);
			continue;
		}

		const baseValue = isRecord(current[field]) ? current[field] : {};
		const mergedValue: RecordValue = { ...baseValue };
		for (const key of nestedFields) {
			mergedValue[key] = structuredClone(value[key]);
		}
		(result as RecordValue)[field] = mergedValue;
	}

	return result;
}
