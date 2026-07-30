import type { TaskRequirements } from "#orchestrator/task/types";

const EMPTY_REQUIREMENTS: TaskRequirements = Object.freeze({});

export function normalizeRequirements(value: TaskRequirements | undefined, field = "requires"): TaskRequirements {
	if (value === undefined) return EMPTY_REQUIREMENTS;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${field} must be an object.`);
	}
	return Object.freeze({
		capabilities: normalizeList(value.capabilities, `${field}.capabilities`),
		tools: normalizeList(value.tools, `${field}.tools`),
		provider: normalizeString(value.provider, `${field}.provider`),
		api: normalizeString(value.api, `${field}.api`),
		model: normalizeString(value.model, `${field}.model`),
	});
}

export function cloneRequirements(value: TaskRequirements | undefined): TaskRequirements {
	const requirements = normalizeRequirements(value);
	return Object.freeze({
		...(requirements.capabilities !== undefined ? { capabilities: [...requirements.capabilities] } : {}),
		...(requirements.tools !== undefined ? { tools: [...requirements.tools] } : {}),
		...(requirements.provider !== undefined ? { provider: requirements.provider } : {}),
		...(requirements.api !== undefined ? { api: requirements.api } : {}),
		...(requirements.model !== undefined ? { model: requirements.model } : {}),
	});
}

export function formatRequirements(value: TaskRequirements): string[] {
	const lines: string[] = [];
	if (value.capabilities?.length) lines.push(`Capabilities: ${value.capabilities.join(", ")}`);
	if (value.tools?.length) lines.push(`Tools: ${value.tools.join(", ")}`);
	if (value.provider) lines.push(`Provider: ${value.provider}`);
	if (value.api) lines.push(`API: ${value.api}`);
	if (value.model) lines.push(`Model: ${value.model}`);
	return lines;
}

function normalizeList(value: readonly string[] | undefined, field: string): readonly string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
	const normalized = value.map((item) => normalizeRequiredString(item, field));
	return Object.freeze([...new Set(normalized)]);
}

function normalizeString(value: string | undefined, field: string): string | undefined {
	if (value === undefined) return undefined;
	return normalizeRequiredString(value, field);
}

function normalizeRequiredString(value: string, field: string): string {
	if (typeof value !== "string") throw new Error(`${field} entries must be strings.`);
	const trimmed = value.trim();
	if (trimmed.length === 0) throw new Error(`${field} entries must be non-empty strings.`);
	return trimmed;
}
