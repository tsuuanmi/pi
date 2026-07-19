import type { BundledPackageName, ResourceType, TopLevelResourceType } from "#coding-agent/core/package-manager/types";
import type { PackageSource } from "#coding-agent/core/settings/settings-manager";

export const NETWORK_TIMEOUT_MS = 10000;
export const UPDATE_CHECK_CONCURRENCY = 4;
export const GIT_UPDATE_CONCURRENCY = 4;

export const RESOURCE_TYPES: ResourceType[] = ["extensions", "skills", "prompts", "themes", "commands", "agents"];
export const TOP_LEVEL_RESOURCE_TYPES: TopLevelResourceType[] = ["extensions", "skills", "prompts", "themes"];

export const BUNDLED_PACKAGE_SOURCES: Record<string, BundledPackageName> = {
	"pi:workflows": "workflows",
	"pi:lsp": "lsp",
	"pi:mcp": "mcp",
	"pi:providers": "providers",
};

export const BUNDLED_DEFAULT_PACKAGES: PackageSource[] = ["pi:workflows", "pi:lsp", "pi:mcp", "pi:providers"];

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
