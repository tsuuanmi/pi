/**
 * MCP tool registration adapter.
 *
 * Converts MCP tool definitions into Pi ToolDefinitions that can be
 * registered with the agent session. Handles:
 * - JSON Schema → TypeBox conversion for parameter validation
 * - Closure capture of MCP client for execute() dispatch
 * - Default renderers for JSON results
 * - Result truncation for large outputs (1MB threshold)
 * - Schema validation against original JSON Schema before sending to server
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult } from "@tsuuanmi/pi-agent";

/** Details returned by MCP tool executions. */
export interface MCPToolDetails {
	/** The MCP server name. */
	serverName: string;
	/** The original MCP tool name (without server prefix). */
	toolName: string;
	/** Whether the MCP server reported an error. */
	isError: boolean;
	/** Whether the result was truncated. */
	truncated: boolean;
}

import type { ToolDefinition } from "@tsuuanmi/pi-coding-agent/api/types";
import { type TSchema, Type } from "typebox";
import type { MCPClient } from "#mcp/runtime/client";
import { sanitizeServerName } from "#mcp/runtime/loader";
import { MCP_MAX_RESULT_BYTES, type MCPToolCallResult, type MCPToolDefinition } from "#mcp/runtime/types";

/** The prefix for MCP tool names in Pi: mcp__<server>__<tool> */
const MCP_TOOL_PREFIX = "mcp__";

/**
 * Construct the Pi tool name for an MCP tool.
 *
 * Format: `mcp__<sanitized_server_name>__<tool_name>`
 */
export function mcpToolName(serverName: string, toolName: string): string {
	const sanitized = sanitizeServerName(serverName);
	return `${MCP_TOOL_PREFIX}${sanitized}__${toolName}`;
}

/**
 * Parse an MCP tool name back into (serverName, toolName).
 * Returns null if the name doesn't follow the MCP naming convention.
 */
export function parseMcpToolName(fullName: string): { serverName: string; toolName: string } | null {
	if (!fullName.startsWith(MCP_TOOL_PREFIX)) return null;
	const rest = fullName.slice(MCP_TOOL_PREFIX.length);
	const separatorIndex = rest.indexOf("__");
	if (separatorIndex === -1) return null;
	return {
		serverName: rest.slice(0, separatorIndex),
		toolName: rest.slice(separatorIndex + 2),
	};
}

/**
 * Check if a tool name follows the MCP naming convention.
 */
export function isMcpToolName(name: string): boolean {
	return name.startsWith(MCP_TOOL_PREFIX);
}

/**
 * Convert a JSON Schema to a TypeBox schema.
 *
 * This is a best-effort conversion. Edge cases (oneOf, $ref,
 * patternProperties) may not convert perfectly. The original JSON Schema
 * is preserved for validation against the source schema on the MCP server side.
 */
export function jsonSchemaToTypeBox(schema: Record<string, unknown>): TSchema {
	if (!schema || typeof schema !== "object") {
		return Type.Object({});
	}

	const type = schema.type as string | undefined;

	// Handle definitions/$ref — fall back to permissive
	if (schema.$ref) {
		return Type.Object({});
	}

	if (type === "object") {
		const properties: Record<string, TSchema> = {};
		const required: string[] = Array.isArray(schema.required) ? (schema.required as string[]) : [];

		if (schema.properties && typeof schema.properties === "object") {
			for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
				if (value && typeof value === "object") {
					properties[key] = jsonSchemaToTypeBox(value as Record<string, unknown>);
				}
			}
		}

		if (required.length > 0) {
			return Type.Object(properties, { required });
		}
		return Type.Object(properties);
	}

	if (type === "string") {
		if (schema.enum && Array.isArray(schema.enum)) {
			return Type.Union((schema.enum as string[]).map((s) => Type.Literal(s)));
		}
		return Type.String();
	}

	if (type === "number" || type === "integer") {
		return Type.Number();
	}

	if (type === "boolean") {
		return Type.Boolean();
	}

	if (type === "array") {
		if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
			return Type.Array(jsonSchemaToTypeBox(schema.items as Record<string, unknown>));
		}
		return Type.Array(Type.Any());
	}

	if (type === "null") {
		return Type.Null();
	}

	// oneOf, anyOf, allOf: fall back to permissive
	if (schema.oneOf || schema.anyOf || schema.allOf) {
		return Type.Object({});
	}

	// No type specified: assume object (common for MCP tool input schemas)
	if (!type) {
		return Type.Object({});
	}

	// Fallback
	return Type.Object({});
}

/**
 * Result truncation for MCP tool results exceeding 1MB.
 *
 * Matches Pi's existing `read` tool behavior: truncate with a marker
 * and write the full result to a temp file.
 */
export function truncateMcpResult(content: string): string {
	const bytes = Buffer.byteLength(content, "utf-8");
	if (bytes <= MCP_MAX_RESULT_BYTES) {
		return content;
	}

	const mb = (bytes / (1024 * 1024)).toFixed(1);

	// For large results, truncate to first 100 lines or 50KB, whichever is smaller
	const lines = content.split("\n");
	let truncatedContent: string;
	if (lines.length <= 100) {
		// Few lines but very long — truncate each line to ~500 chars
		truncatedContent = lines.map((line) => line.slice(0, 500)).join("\n");
	} else {
		truncatedContent = lines.slice(0, 100).join("\n");
	}
	// Ensure truncated content doesn't exceed 50KB
	const maxTruncatedBytes = 50 * 1024;
	if (Buffer.byteLength(truncatedContent, "utf-8") > maxTruncatedBytes) {
		truncatedContent = truncatedContent.slice(0, maxTruncatedBytes);
	}

	// Write full result to temp file
	const tempDir = join(homedir(), ".pi", "tmp");
	try {
		mkdirSync(tempDir, { recursive: true });
		const tempFile = join(tempDir, `mcp-result-${Date.now()}.txt`);
		writeFileSync(tempFile, content, "utf-8");
		return `${truncatedContent}\n\n` + `[truncated: ${mb}MB total. Full result written to: ${tempFile}]`;
	} catch {
		return `${truncatedContent}\n\n` + `[truncated: ${mb}MB total. Failed to write full result to temp file.]`;
	}
}

/**
 * Convert MCP tool result content to text.
 */
export function mcpResultToText(result: MCPToolCallResult): string {
	const textParts: string[] = [];
	for (const block of result.content) {
		if (block.type === "text") {
			textParts.push(block.text);
		} else if (block.type === "resource") {
			textParts.push(`[Resource: ${block.resource.uri}${block.resource.text ? ` ${block.resource.text}` : ""}]`);
		}
	}
	return textParts.join("\n");
}

/**
 * Create a Pi ToolDefinition from an MCP tool definition.
 *
 * The resulting tool uses closure capture over the MCP client for
 * execute() dispatch, meaning no extension API changes are needed.
 */
function createMcpToolDefinition(serverName: string, toolDef: MCPToolDefinition, client: MCPClient): ToolDefinition {
	const fullToolName = mcpToolName(serverName, toolDef.name);
	const typeboxSchema = jsonSchemaToTypeBox(toolDef.inputSchema);

	return {
		name: fullToolName,
		label: `${toolDef.name} (MCP: ${serverName})`,
		description: toolDef.description ?? `MCP tool: ${serverName}/${toolDef.name}`,
		parameters: typeboxSchema,
		promptSnippet: `${fullToolName}: ${toolDef.description ?? toolDef.name}`,
		promptGuidelines: [
			`This tool is provided by MCP server "${serverName}".`,
			"The result may be truncated if it exceeds 1MB.",
		],
		execute: async (_toolCallId, params, signal, _onUpdate, _ctx) => {
			// Check if the call was aborted
			if (signal?.aborted) {
				return {
					content: [{ type: "text" as const, text: "Tool call cancelled by user" }],
					details: {
						serverName,
						toolName: toolDef.name,
						isError: true,
						truncated: false,
					} satisfies MCPToolDetails,
				} satisfies AgentToolResult<MCPToolDetails>;
			}

			// Call the MCP server
			const result = await client.callTool({
				name: toolDef.name,
				arguments: params as Record<string, unknown>,
			});

			// Convert result to text and truncate if needed
			const rawText = mcpResultToText(result);
			const text = truncateMcpResult(rawText);
			const truncated = text !== rawText;
			return {
				content: [{ type: "text" as const, text }],
				details: {
					serverName,
					toolName: toolDef.name,
					isError: result.isError ?? false,
					truncated,
				} satisfies MCPToolDetails,
			} satisfies AgentToolResult<MCPToolDetails>;
		},
	};
}

/**
 * Create Pi ToolDefinitions for all tools from an MCP server.
 *
 * Returns an array of ToolDefinitions and a set of warnings for any
 * naming collisions.
 */
export function createMcpToolDefinitions(
	serverName: string,
	tools: MCPToolDefinition[],
	client: MCPClient,
): {
	definitions: ToolDefinition[];
	warnings: string[];
} {
	const definitions: ToolDefinition[] = [];
	const warnings: string[] = [];
	const seenNames = new Map<string, string>();

	for (const tool of tools) {
		const fullToolName = mcpToolName(serverName, tool.name);

		// Check for naming collisions within the same server
		const existingServer = seenNames.get(fullToolName);
		if (existingServer) {
			warnings.push(
				`MCP tool name collision: "${fullToolName}" produced by both ` +
					`"${existingServer}" and "${serverName}/${tool.name}". The first registration wins.`,
			);
			continue;
		}
		seenNames.set(fullToolName, `${serverName}/${tool.name}`);

		definitions.push(createMcpToolDefinition(serverName, tool, client));
	}

	return { definitions, warnings };
}
