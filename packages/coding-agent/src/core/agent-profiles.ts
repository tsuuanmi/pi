import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { stripJsonComments } from "../utils/fs/json.ts";
import { CONFIG_DIR_NAME } from "./config.ts";
import type { SettingsManager } from "./settings-manager.ts";

export interface AgentProfile {
	name: string;
	description?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	tools?: string[];
	excludeTools?: string[];
	systemPrompt?: string;
	appendSystemPrompt?: string;
	persistent?: boolean;
}

export interface AgentProfileLoadResult {
	profiles: AgentProfile[];
	diagnostics: Array<{ path: string; message: string }>;
}

const THINKING_LEVELS = new Set<string>(["off", "minimal", "low", "medium", "high"]);

const BUILT_IN_AGENT_PROFILES: AgentProfile[] = [
	{
		name: "planner",
		description: "Planner role for turning requirements into executable plans.",
		thinkingLevel: "high",
		tools: ["read", "grep", "find", "bash", "ralplan_write_artifact"],
		persistent: true,
	},
	{
		name: "architect",
		description: "Architect role for feasibility, architecture, and integration review.",
		thinkingLevel: "high",
		tools: ["read", "grep", "find", "bash", "ralplan_write_artifact"],
		persistent: true,
	},
	{
		name: "critic",
		description: "Critic role for risks, tests, edge cases, and failure modes.",
		thinkingLevel: "high",
		tools: ["read", "grep", "find", "bash", "ralplan_write_artifact"],
		persistent: true,
	},
	{
		name: "worker",
		description: "Implementation worker role for executing an assigned task or goal.",
		thinkingLevel: "medium",
		tools: ["read", "bash", "write", "edit"],
		persistent: true,
	},
];

function asStringArray(value: unknown, field: string, path: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
		throw new Error(`${field} must be an array of strings in ${path}`);
	}
	return value;
}

function asThinkingLevel(value: unknown, path: string): ThinkingLevel | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !THINKING_LEVELS.has(value)) {
		throw new Error(`thinkingLevel must be one of off, minimal, low, medium, high in ${path}`);
	}
	return value as ThinkingLevel;
}

function asOptionalString(value: unknown, field: string, path: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new Error(`${field} must be a string in ${path}`);
	return value;
}

function asOptionalBoolean(value: unknown, field: string, path: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") throw new Error(`${field} must be a boolean in ${path}`);
	return value;
}

function parseProfile(raw: unknown, path: string): AgentProfile {
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		throw new Error(`agent profile must be an object in ${path}`);
	const record = raw as Record<string, unknown>;
	const fallbackName = basename(path, extname(path));
	const name = asOptionalString(record.name, "name", path) ?? fallbackName;
	if (!name.trim()) throw new Error(`agent profile name cannot be empty in ${path}`);
	return {
		name,
		description: asOptionalString(record.description, "description", path),
		model: asOptionalString(record.model, "model", path),
		thinkingLevel: asThinkingLevel(record.thinkingLevel, path),
		tools: asStringArray(record.tools, "tools", path),
		excludeTools: asStringArray(record.excludeTools, "excludeTools", path),
		systemPrompt: asOptionalString(record.systemPrompt, "systemPrompt", path),
		appendSystemPrompt: asOptionalString(record.appendSystemPrompt, "appendSystemPrompt", path),
		persistent: asOptionalBoolean(record.persistent, "persistent", path),
	};
}

async function loadProfileDir(dir: string): Promise<AgentProfileLoadResult> {
	const result: AgentProfileLoadResult = { profiles: [], diagnostics: [] };
	if (!existsSync(dir)) return result;
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch (error) {
		result.diagnostics.push({ path: dir, message: error instanceof Error ? error.message : String(error) });
		return result;
	}
	for (const entry of entries.sort()) {
		if (!entry.endsWith(".json")) continue;
		const path = join(dir, entry);
		try {
			const raw = await readFile(path, "utf8");
			result.profiles.push(parseProfile(JSON.parse(stripJsonComments(raw)) as unknown, path));
		} catch (error) {
			result.diagnostics.push({ path, message: error instanceof Error ? error.message : String(error) });
		}
	}
	return result;
}

async function loadAgentProfiles(options: {
	cwd: string;
	agentDir: string;
	settingsManager: SettingsManager;
}): Promise<AgentProfileLoadResult> {
	const diagnostics: Array<{ path: string; message: string }> = [];
	const byName = new Map<string, AgentProfile>();
	for (const profile of BUILT_IN_AGENT_PROFILES) byName.set(profile.name, profile);

	for (const dir of [join(options.agentDir, "agents")]) {
		const loaded = await loadProfileDir(dir);
		diagnostics.push(...loaded.diagnostics);
		for (const profile of loaded.profiles) byName.set(profile.name, profile);
	}

	if (options.settingsManager.isProjectTrusted()) {
		const loaded = await loadProfileDir(join(options.cwd, CONFIG_DIR_NAME, "agents"));
		diagnostics.push(...loaded.diagnostics);
		for (const profile of loaded.profiles) byName.set(profile.name, profile);
	}

	return { profiles: Array.from(byName.values()), diagnostics };
}

export async function loadAgentProfile(
	options: { cwd: string; agentDir: string; settingsManager: SettingsManager },
	name: string | undefined,
): Promise<AgentProfile | undefined> {
	if (!name) return undefined;
	const result = await loadAgentProfiles(options);
	return result.profiles.find((profile) => profile.name === name);
}
