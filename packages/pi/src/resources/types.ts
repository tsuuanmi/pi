export interface PathMetadata {
	source: string;
	scope: SourceScope;
	origin: SourceOrigin;
	baseDir?: string;
}

export interface ResolvedResource {
	path: string;
	enabled: boolean;
	metadata: PathMetadata;
}

export interface ResolvedPaths {
	extensions: ResolvedResource[];
	skills: ResolvedResource[];
	prompts: ResolvedResource[];
	themes: ResolvedResource[];
	commands: ResolvedResource[];
	agents: ResolvedResource[];
}

export type SourceScope = "user" | "project" | "temporary";
export type SourceOrigin = "package" | "top-level";
export type ResourceType = "extensions" | "skills" | "prompts" | "themes" | "commands" | "agents";
export type TopLevelResourceType = "extensions" | "skills" | "prompts" | "themes";
export type SkillDiscoveryMode = "pi" | "agents";

export interface PiManifest {
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
	commands?: string[];
	agents?: string[];
}

export interface PackageFilter {
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
	commands?: string[];
	agents?: string[];
}
