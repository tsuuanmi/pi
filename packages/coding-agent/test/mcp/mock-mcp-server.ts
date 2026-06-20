/**
 * Mock MCP server for testing.
 *
 * Implements a minimal MCP server over stdio (stdin/stdout) that supports:
 * - initialize handshake
 * - tools/list (returns configurable tools)
 * - tools/call (echos back arguments, supports error responses, supports large results)
 * - notifications/initialized
 * - Abrupt disconnection mid-call
 *
 * Usage: spawn as a subprocess and communicate via JSON-RPC over stdin/stdout.
 */

import { createInterface } from "node:readline";

// ============================================================================
// Types
// ============================================================================

interface MockTool {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
	handler?: (args: Record<string, unknown>) => { content: MockContent[]; isError?: boolean };
}

interface MockContent {
	type: "text";
	text: string;
}

interface MockServerConfig {
	tools: MockTool[];
	/** If set, the server will exit after sending this many responses. */
	exitAfterResponses?: number;
	/** If set, delay responses by this many milliseconds. */
	responseDelayMs?: number;
	/** If set, the server will disconnect after this many milliseconds. */
	disconnectAfterMs?: number;
}

// ============================================================================
// Server
// ============================================================================

const DEFAULT_TOOLS: MockTool[] = [
	{
		name: "echo",
		description: "Echo back the input arguments",
		inputSchema: {
			type: "object",
			properties: {
				message: { type: "string", description: "The message to echo" },
			},
			required: ["message"],
		},
		handler: (args) => ({
			content: [{ type: "text" as const, text: `Echo: ${args.message}` }],
		}),
	},
	{
		name: "add",
		description: "Add two numbers",
		inputSchema: {
			type: "object",
			properties: {
				a: { type: "number", description: "First number" },
				b: { type: "number", description: "Second number" },
			},
			required: ["a", "b"],
		},
		handler: (args) => ({
			content: [{ type: "text" as const, text: `${Number(args.a) + Number(args.b)}` }],
		}),
	},
	{
		name: "error_tool",
		description: "Always returns an error",
		inputSchema: {
			type: "object",
			properties: {
				message: { type: "string" },
			},
		},
		handler: (args) => ({
			content: [{ type: "text" as const, text: (args.message as string) ?? "Error from error_tool" }],
			isError: true,
		}),
	},
	{
		name: "large_result",
		description: "Returns a large result for truncation testing",
		inputSchema: {
			type: "object",
			properties: {
				size_kb: { type: "number", description: "Size in KB" },
			},
		},
		handler: (args) => {
			const sizeKb = Number(args.size_kb) ?? 100;
			const text = "A".repeat(sizeKb * 1024);
			return {
				content: [{ type: "text" as const, text }],
			};
		},
	},
];

// Parse config from environment variable
function getServerConfig(): MockServerConfig {
	const configEnv = process.env.MCP_MOCK_CONFIG;
	if (!configEnv) {
		return { tools: DEFAULT_TOOLS };
	}
	try {
		return JSON.parse(configEnv);
	} catch {
		return { tools: DEFAULT_TOOLS };
	}
}

function main(): void {
	const config = getServerConfig();
	let responseCount = 0;

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	rl.on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;

		let request: { jsonrpc: string; id?: number | string; method: string; params?: Record<string, unknown> };
		try {
			request = JSON.parse(trimmed);
		} catch {
			return;
		}

		// Check if we should delay
		const delay = config.responseDelayMs ?? 0;

		// Handle disconnect timer
		if (config.disconnectAfterMs) {
			setTimeout(() => {
				process.exit(1);
			}, config.disconnectAfterMs);
		}

		setTimeout(() => {
			const response = handleRequest(request, config.tools);
			if (response) {
				process.stdout.write(`${JSON.stringify(response)}\n`);
				responseCount++;

				if (config.exitAfterResponses && responseCount >= config.exitAfterResponses) {
					process.exit(0);
				}
			}
		}, delay);
	});

	// Keep alive
	rl.on("close", () => {
		process.exit(0);
	});
}

function handleRequest(
	request: { jsonrpc: string; id?: number | string; method: string; params?: Record<string, unknown> },
	tools: MockTool[],
): unknown | null {
	const { id, method, params } = request;

	switch (method) {
		case "initialize":
			return {
				jsonrpc: "2.0",
				id,
				result: {
					protocolVersion: "2025-03-26",
					capabilities: {
						tools: {},
					},
					serverInfo: {
						name: "mock-mcp-server",
						version: "1.0.0",
					},
				},
			};

		case "notifications/initialized":
			// No response for notifications
			return null;

		case "tools/list":
			return {
				jsonrpc: "2.0",
				id,
				result: {
					tools: tools.map((t) => ({
						name: t.name,
						description: t.description,
						inputSchema: t.inputSchema,
					})),
				},
			};

		case "tools/call": {
			const toolName = params?.name as string;
			const toolArgs = (params?.arguments as Record<string, unknown>) ?? {};
			const tool = tools.find((t) => t.name === toolName);

			if (!tool) {
				return {
					jsonrpc: "2.0",
					id,
					result: {
						content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
						isError: true,
					},
				};
			}

			try {
				const result = tool.handler
					? tool.handler(toolArgs)
					: {
							content: [{ type: "text" as const, text: JSON.stringify(toolArgs) }],
						};
				return {
					jsonrpc: "2.0",
					id,
					result: {
						content: result.content,
						isError: result.isError ?? false,
					},
				};
			} catch (error) {
				return {
					jsonrpc: "2.0",
					id,
					result: {
						content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
						isError: true,
					},
				};
			}
		}

		default:
			return {
				jsonrpc: "2.0",
				id,
				error: {
					code: -32601,
					message: `Method not found: ${method}`,
				},
			};
	}
}

// Only run if executed directly (not imported as a module)
main();
