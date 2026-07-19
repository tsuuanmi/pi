/**
 * MCP configuration loader.
 *
 * Discovers MCP server configurations from:
 * - Project-scoped: `.mcp.json` in the project root (gated by project trust)
 * - Global: `~/.pi/mcp.json` (always loaded)
 *
 * Project config takes precedence over global config when the same server name
 * appears in both. A warning is logged for such overlaps.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR_NAME } from "@tsuuanmi/pi-coding-agent/core/config/config";
import type { MCPConfigFile, MCPServerConfig } from "#mcp/runtime/types";

export interface MCPLoadResult {
	servers: Map<string, MCPServerConfig>;
	warnings: string[];
	errors: string[];
}

/**
 * Load MCP server configurations from project and global config files.
 *
 * Project-scoped configs (`.mcp.json` in project root) are only loaded
 * when project trust is granted. Global configs (`~/.pi/mcp.json`) are
 * always loaded.
 *
 * When the same server name appears in both configs, the project config
 * takes precedence and a warning is logged.
 */
export function loadMCPConfigs(options: {
	cwd: string;
	isProjectTrusted: boolean;
	globalMcpJsonPath?: string;
}): MCPLoadResult {
	const servers = new Map<string, MCPServerConfig>();
	const warnings: string[] = [];
	const errors: string[] = [];

	// Load global config first (always loaded)
	const globalPath = options.globalMcpJsonPath ?? join(homedir(), CONFIG_DIR_NAME, "mcp.json");
	const globalResult = loadMCPConfigFile(globalPath);
	if (globalResult.config) {
		for (const [name, config] of Object.entries(globalResult.config.mcpServers)) {
			if (config.disabled) continue;
			servers.set(name, config);
		}
	}
	warnings.push(...globalResult.warnings);
	errors.push(...globalResult.errors);

	// Load project config (gated by trust)
	if (options.isProjectTrusted) {
		const projectPath = join(options.cwd, ".mcp.json");
		const projectResult = loadMCPConfigFile(projectPath);
		if (projectResult.config) {
			for (const [name, config] of Object.entries(projectResult.config.mcpServers)) {
				if (config.disabled) continue;
				if (servers.has(name)) {
					warnings.push(
						`MCP server "${name}" defined in both global and project config. ` +
							`Project config takes precedence.`,
					);
				}
				servers.set(name, config);
			}
		}
		warnings.push(...projectResult.warnings);
		errors.push(...projectResult.errors);
	}

	return { servers, warnings, errors };
}

/**
 * Load and validate a single MCP config file.
 */
export function loadMCPConfigFile(filePath: string): {
	config: MCPConfigFile | null;
	warnings: string[];
	errors: string[];
} {
	const warnings: string[] = [];
	const errors: string[] = [];

	if (!existsSync(filePath)) {
		return { config: null, warnings, errors };
	}

	let raw: string;
	try {
		raw = readFileSync(filePath, "utf-8");
	} catch (err) {
		errors.push(`Failed to read MCP config ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
		return { config: null, warnings, errors };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		errors.push(`Failed to parse MCP config ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
		return { config: null, warnings, errors };
	}

	const validated = validateMCPConfig(parsed, filePath);
	warnings.push(...validated.warnings);
	errors.push(...validated.errors);

	return { config: validated.config, warnings, errors };
}

/**
 * Validate an MCP config object.
 *
 * Accepts both the Pi-native format (with `mcpConfigVersion` and `mcpServers`)
 * and the common format (with `mcpServers` only, no version field).
 */
export function validateMCPConfig(
	parsed: unknown,
	filePath: string,
): { config: MCPConfigFile | null; warnings: string[]; errors: string[] } {
	const warnings: string[] = [];
	const errors: string[] = [];

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		errors.push(`MCP config ${filePath} must be a JSON object`);
		return { config: null, warnings, errors };
	}

	const obj = parsed as Record<string, unknown>;

	// Check version field if present
	if ("mcpConfigVersion" in obj) {
		if (obj.mcpConfigVersion !== 1) {
			errors.push(
				`MCP config ${filePath} has unsupported mcpConfigVersion: ${obj.mcpConfigVersion}. ` +
					`Supported versions: 1`,
			);
			return { config: null, warnings, errors };
		}
	} else {
		warnings.push(`MCP config ${filePath} missing mcpConfigVersion field. Defaulting to version 1.`);
	}

	// Validate mcpServers
	if (!("mcpServers" in obj) || typeof obj.mcpServers !== "object" || obj.mcpServers === null) {
		// No servers defined — valid but empty
		if (!("mcpServers" in obj)) {
			warnings.push(`MCP config ${filePath} has no mcpServers field. No servers will be loaded.`);
		} else {
			errors.push(`MCP config ${filePath} mcpServers must be an object`);
		}
		return {
			config: { mcpConfigVersion: 1, mcpServers: {} },
			warnings,
			errors,
		};
	}

	const mcpServers = obj.mcpServers as Record<string, unknown>;
	const validatedServers: Record<string, MCPServerConfig> = {};

	for (const [name, serverConfig] of Object.entries(mcpServers)) {
		if (!serverConfig || typeof serverConfig !== "object" || Array.isArray(serverConfig)) {
			errors.push(`MCP server "${name}" config must be an object`);
			continue;
		}

		const validated = validateMCPServerConfig(name, serverConfig as Record<string, unknown>, filePath);
		if (validated.config) {
			validatedServers[name] = validated.config;
		}
		warnings.push(...validated.warnings);
		errors.push(...validated.errors);
	}

	return {
		config: { mcpConfigVersion: 1, mcpServers: validatedServers },
		warnings,
		errors,
	};
}

/**
 * Validate a single MCP server config.
 */
function validateMCPServerConfig(
	name: string,
	config: Record<string, unknown>,
	filePath: string,
): { config: MCPServerConfig | null; warnings: string[]; errors: string[] } {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Check for disabled flag
	const disabled = config.disabled === true;

	// Validate transport
	if (!config.transport || typeof config.transport !== "object" || Array.isArray(config.transport)) {
		// Try common format where transport fields are at top level
		// e.g., { "command": "npx", "args": ["-y", "server"] }
		if (config.command && typeof config.command === "string") {
			// Stdio transport in common format
			const transport = {
				type: "stdio" as const,
				command: config.command as string,
				...(config.args ? { args: config.args as string[] } : {}),
				...(config.env ? { env: config.env as Record<string, string> } : {}),
			};
			return {
				config: {
					transport,
					...(disabled ? { disabled } : {}),
					...(config.startupTimeoutSec ? { startupTimeoutSec: config.startupTimeoutSec as number } : {}),
					...(config.reconnectTimeoutSec ? { reconnectTimeoutSec: config.reconnectTimeoutSec as number } : {}),
					...(config.toolCallTimeoutSec ? { toolCallTimeoutSec: config.toolCallTimeoutSec as number } : {}),
				},
				warnings: [
					`MCP server "${name}" uses common format (top-level command/args). ` +
						`Consider using the transport object format.`,
				],
				errors,
			};
		}

		if (config.url && typeof config.url === "string") {
			// HTTP transport in common format
			return {
				config: {
					transport: {
						type: "http",
						url: config.url as string,
						...(config.headers ? { headers: config.headers as Record<string, string> } : {}),
					},
					...(disabled ? { disabled } : {}),
				},
				warnings: [
					`MCP server "${name}" uses common format (top-level url). ` +
						`Consider using the transport object format.`,
				],
				errors,
			};
		}

		errors.push(
			`MCP server "${name}" in ${filePath} must have a "transport" field or top-level "command"/"url" field`,
		);
		return { config: null, warnings, errors };
	}

	const transport = config.transport as Record<string, unknown>;

	if (transport.type === "stdio") {
		if (!transport.command || typeof transport.command !== "string") {
			errors.push(`MCP server "${name}" stdio transport must have a "command" string`);
			return { config: null, warnings, errors };
		}

		return {
			config: {
				transport: {
					type: "stdio",
					command: transport.command,
					...(transport.args ? { args: transport.args as string[] } : {}),
					...(transport.env ? { env: transport.env as Record<string, string> } : {}),
				},
				...(disabled ? { disabled } : {}),
				...(config.startupTimeoutSec ? { startupTimeoutSec: config.startupTimeoutSec as number } : {}),
				...(config.reconnectTimeoutSec ? { reconnectTimeoutSec: config.reconnectTimeoutSec as number } : {}),
				...(config.toolCallTimeoutSec ? { toolCallTimeoutSec: config.toolCallTimeoutSec as number } : {}),
			},
			warnings,
			errors,
		};
	}

	if (transport.type === "http") {
		if (!transport.url || typeof transport.url !== "string") {
			errors.push(`MCP server "${name}" http transport must have a "url" string`);
			return { config: null, warnings, errors };
		}

		return {
			config: {
				transport: {
					type: "http",
					url: transport.url,
					...(transport.headers ? { headers: transport.headers as Record<string, string> } : {}),
					...(transport.reconnectIntervalMs
						? { reconnectIntervalMs: transport.reconnectIntervalMs as number }
						: {}),
				},
				...(disabled ? { disabled } : {}),
				...(config.startupTimeoutSec ? { startupTimeoutSec: config.startupTimeoutSec as number } : {}),
				...(config.reconnectTimeoutSec ? { reconnectTimeoutSec: config.reconnectTimeoutSec as number } : {}),
				...(config.toolCallTimeoutSec ? { toolCallTimeoutSec: config.toolCallTimeoutSec as number } : {}),
			},
			warnings,
			errors,
		};
	}

	errors.push(`MCP server "${name}" transport type must be "stdio" or "http", got "${transport.type}"`);
	return { config: null, warnings, errors };
}

/**
 * Sanitize a server name for use in the `mcp__<server>__<tool>` naming convention.
 *
 * Replaces non-alphanumeric characters with `_`, collapses consecutive `_`,
 * and detects unresolvable ambiguities (names that would produce the same
 * sanitized tool name as another server).
 */
export function sanitizeServerName(name: string): string {
	// Replace non-alphanumeric characters with underscore
	let sanitized = name.replace(/[^a-zA-Z0-9]/g, "_");
	// Collapse consecutive underscores
	sanitized = sanitized.replace(/_+/g, "_");
	// Strip leading/trailing underscores
	sanitized = sanitized.replace(/^_+|_+$/g, "");
	// Ensure non-empty
	return sanitized || "unnamed";
}

/**
 * Check if two server names would produce the same sanitized name,
 * creating an ambiguity in tool naming.
 */
export function isServerNameAmbiguous(name1: string, name2: string): boolean {
	return sanitizeServerName(name1) === sanitizeServerName(name2) && name1 !== name2;
}
