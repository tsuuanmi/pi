import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ThinkingLevel } from "@tsuuanmi/pi-agent";
import { parseFrontmatter } from "../../utils/fs/frontmatter.ts";
import { canonicalizePath, resolvePath } from "../../utils/fs/paths.ts";
import type { ResourceDiagnostic } from "../resources/diagnostics.ts";
import type { AgentProfile } from "./agent-profiles.ts";

export type AgentSourceLevel = "bundled" | "user" | "project" | "package" | "temporary";
export type AgentProfileFormat = "markdown" | "bundled";

export interface AgentSourceInfo {
	path: string;
	providerId: string;
	providerDisplayName: string;
	level: AgentSourceLevel;
	scopeRoot?: string;
	format: AgentProfileFormat;
}

export interface LoadedAgentProfile extends AgentProfile {
	sourceInfo: AgentSourceInfo;
}

export interface AgentProfileLoadResult {
	profiles: LoadedAgentProfile[];
	diagnostics: ResourceDiagnostic[];
}

interface AgentFrontmatter {
	name?: unknown;
	description?: unknown;
	model?: unknown;
	thinkingLevel?: unknown;
	"thinking-level"?: unknown;
	thinking?: unknown;
	tools?: unknown;
	excludeTools?: unknown;
	systemPrompt?: unknown;
	appendSystemPrompt?: unknown;
	persistent?: unknown;
	spawns?: unknown;
	output?: unknown;
	autoloadSkills?: unknown;
	blocking?: unknown;
	hide?: unknown;
	forkContext?: unknown;
	bashAllowedPrefixes?: unknown;
	[key: string]: unknown;
}

const THINKING_LEVELS = new Set<string>(["off", "minimal", "low", "medium", "high"]);
const SAFETY_RESERVED_FIELDS = ["forkContext", "bashAllowedPrefixes", "spawns"] as const;
const WARNING_RESERVED_FIELDS = ["output", "autoloadSkills", "blocking", "hide"] as const;
const KNOWN_MARKDOWN_FIELDS = new Set<string>([
	"name",
	"description",
	"model",
	"thinkingLevel",
	"thinking-level",
	"thinking",
	"tools",
	"excludeTools",
	"systemPrompt",
	"appendSystemPrompt",
	"persistent",
	...SAFETY_RESERVED_FIELDS,
	...WARNING_RESERVED_FIELDS,
]);

function diagnostic(type: ResourceDiagnostic["type"], message: string, path?: string): ResourceDiagnostic {
	return { type, message, ...(path ? { path } : {}) };
}

function asOptionalString(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	return value;
}

function asRequiredString(value: unknown, field: string): string {
	const string = asOptionalString(value, field);
	if (!string || string.trim().length === 0) throw new Error(`${field} is required`);
	return string.trim();
}

function asThinkingLevel(value: unknown): ThinkingLevel | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !THINKING_LEVELS.has(value)) {
		throw new Error(`thinkingLevel must be one of off, minimal, low, medium, high`);
	}
	return value as ThinkingLevel;
}

function asStringArray(value: unknown, field: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") {
		const items = value
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
		if (items.length === 0) throw new Error(`${field} must contain at least one item`);
		return items;
	}
	if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim().length > 0)) {
		throw new Error(`${field} must be an array of non-empty strings or a comma-separated string`);
	}
	return value.map((item) => item.trim());
}

function asOptionalBoolean(value: unknown, field: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
	return value;
}

function readMarkdownEntries(dir: string): string[] {
	if (!existsSync(dir)) return [];
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((entry) => {
				const path = join(dir, entry.name);
				let isFile = entry.isFile();
				if (entry.isSymbolicLink()) {
					try {
						isFile = statSync(path).isFile();
					} catch {
						return false;
					}
				}
				return isFile && entry.name.endsWith(".md");
			})
			.map((entry) => join(dir, entry.name))
			.sort();
	} catch {
		return [];
	}
}

function parseMarkdownProfile(
	path: string,
	content: string,
	sourceInfo: AgentSourceInfo,
): { profile?: LoadedAgentProfile; diagnostics: ResourceDiagnostic[] } {
	const diagnostics: ResourceDiagnostic[] = [];
	try {
		const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);
		for (const field of SAFETY_RESERVED_FIELDS) {
			if (frontmatter[field] !== undefined)
				throw new Error(`${field} is reserved for a later phase and is not enforced`);
		}
		for (const field of WARNING_RESERVED_FIELDS) {
			if (frontmatter[field] !== undefined)
				diagnostics.push(diagnostic("warning", `${field} is not supported in Phase 1A and was ignored`, path));
		}
		for (const field of Object.keys(frontmatter)) {
			if (!KNOWN_MARKDOWN_FIELDS.has(field))
				diagnostics.push(diagnostic("warning", `unknown agent field ${field} was ignored`, path));
		}
		if (Array.isArray(frontmatter.model)) throw new Error("model arrays are not supported in Phase 1A");
		const name = asRequiredString(frontmatter.name, "name");
		const description = asRequiredString(frontmatter.description, "description");
		const frontmatterSystemPrompt = asOptionalString(frontmatter.systemPrompt, "systemPrompt")?.trim();
		const bodyPrompt = body.trim();
		const systemPrompt = [frontmatterSystemPrompt, bodyPrompt].filter(Boolean).join("\n\n") || undefined;
		return {
			profile: {
				name,
				description,
				model: asOptionalString(frontmatter.model, "model"),
				thinkingLevel: asThinkingLevel(
					frontmatter.thinkingLevel ?? frontmatter["thinking-level"] ?? frontmatter.thinking,
				),
				tools: asStringArray(frontmatter.tools, "tools"),
				excludeTools: asStringArray(frontmatter.excludeTools, "excludeTools"),
				systemPrompt,
				appendSystemPrompt: asOptionalString(frontmatter.appendSystemPrompt, "appendSystemPrompt"),
				persistent: asOptionalBoolean(frontmatter.persistent, "persistent"),
				sourceInfo,
			},
			diagnostics,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		diagnostics.push(diagnostic("error", message, path));
		return { diagnostics };
	}
}

function findRepoRoot(start: string): string | undefined {
	let current = canonicalizePath(resolvePath(start));
	while (true) {
		if (existsSync(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function projectAncestors(cwd: string, home: string): string[] {
	const ancestors: string[] = [];
	let current = canonicalizePath(resolvePath(cwd));
	const stop = findRepoRoot(current);
	const root = resolve("/");
	while (true) {
		if (current !== home) ancestors.push(current);
		if (current === stop || current === root) break;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return ancestors;
}

interface Candidate {
	path: string;
	sourceInfo: AgentSourceInfo;
}

function addMarkdownCandidates(candidates: Candidate[], dir: string, level: AgentSourceLevel, scopeRoot: string): void {
	for (const path of readMarkdownEntries(dir)) {
		candidates.push({
			path,
			sourceInfo: {
				path,
				providerId: "agents-markdown",
				providerDisplayName: "Agents markdown",
				level,
				scopeRoot,
				format: "markdown",
			},
		});
	}
}

function addPackageAgentCandidates(candidates: Candidate[], paths: string[] | undefined): void {
	for (const path of paths ?? []) {
		candidates.push({
			path,
			sourceInfo: {
				path,
				providerId: "package-agents",
				providerDisplayName: "Package agents",
				level: "package",
				format: "markdown",
			},
		});
	}
}

function applyDuplicateResolution(
	items: Array<{ profile: LoadedAgentProfile; path: string }>,
	diagnostics: ResourceDiagnostic[],
): LoadedAgentProfile[] {
	const byName = new Map<string, LoadedAgentProfile>();
	for (const item of items) {
		const existing = byName.get(item.profile.name);
		if (existing) {
			diagnostics.push({
				type: "collision",
				message: `agent "${item.profile.name}" collision`,
				path: item.path,
				collision: {
					resourceType: "agent",
					name: item.profile.name,
					winnerPath: existing.sourceInfo.path,
					loserPath: item.path,
				},
			});
			continue;
		}
		byName.set(item.profile.name, item.profile);
	}
	return Array.from(byName.values());
}

export function loadAgentDefinitions(options: {
	cwd: string;
	agentDir: string;
	projectTrusted: boolean;
	packageAgentPaths?: string[];
}): AgentProfileLoadResult {
	const cwd = canonicalizePath(resolvePath(options.cwd));
	void options.agentDir;
	const home = canonicalizePath(resolvePath(process.env.HOME || homedir()));
	const candidates: Candidate[] = [];
	const diagnostics: ResourceDiagnostic[] = [];

	if (options.projectTrusted) {
		for (const ancestor of projectAncestors(cwd, home)) {
			addMarkdownCandidates(candidates, join(ancestor, ".agent", "agents"), "project", ancestor);
			addMarkdownCandidates(candidates, join(ancestor, ".agents", "agents"), "project", ancestor);
		}
	}

	addMarkdownCandidates(candidates, join(home, ".agent", "agents"), "user", home);
	addMarkdownCandidates(candidates, join(home, ".agents", "agents"), "user", home);
	addPackageAgentCandidates(candidates, options.packageAgentPaths);
	const loaded: Array<{ profile: LoadedAgentProfile; path: string }> = [];
	for (const candidate of candidates) {
		const result = parseMarkdownProfile(candidate.path, readFileSync(candidate.path, "utf8"), candidate.sourceInfo);
		diagnostics.push(...result.diagnostics);
		if (result.profile) loaded.push({ profile: result.profile, path: candidate.path });
	}

	return { profiles: applyDuplicateResolution(loaded, diagnostics), diagnostics };
}
