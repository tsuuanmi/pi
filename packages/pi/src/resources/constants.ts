import { homedir } from "node:os";
import { sep } from "node:path";
import type { ResourceType, TopLevelResourceType } from "./types.ts";

export const RESOURCE_TYPES: ResourceType[] = ["extensions", "skills", "prompts", "themes", "commands", "agents"];
export const TOP_LEVEL_RESOURCE_TYPES: TopLevelResourceType[] = ["extensions", "skills", "prompts", "themes"];

export const FILE_PATTERNS: Record<ResourceType, RegExp> = {
	extensions: /\.(ts|js)$/,
	skills: /\.md$/,
	prompts: /\.md$/,
	themes: /\.json$/,
	commands: /\.(ts|js|mjs|cjs)$/,
	agents: /\.md$/,
};

export const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];
export const AGENTS_STANDARD_DIR_NAMES = [".agent", ".agents"] as const;
export function getHomeDir(): string {
	return process.env.HOME || homedir();
}

export function toPosixPath(path: string): string {
	return path.split(sep).join("/");
}
