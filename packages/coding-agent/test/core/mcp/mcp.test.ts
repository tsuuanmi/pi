/**
 * Tests for MCP module: types, loader, tool-bridge, and client with mock server.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCPClient } from "../../../src/packages/mcp/runtime/client.ts";
import {
	isServerNameAmbiguous,
	loadMCPConfigFile,
	loadMCPConfigs,
	sanitizeServerName,
	validateMCPConfig,
} from "../../../src/packages/mcp/runtime/loader.ts";
import { MCPManager } from "../../../src/packages/mcp/runtime/manager.ts";
import {
	createMcpToolDefinitions,
	isMcpToolName,
	jsonSchemaToTypeBox,
	mcpResultToText,
	mcpToolName,
	parseMcpToolName,
	truncateMcpResult,
} from "../../../src/packages/mcp/runtime/tool-bridge.ts";
import { HttpTransport, parseSseEvents } from "../../../src/packages/mcp/runtime/transports/http.ts";
import { StdioTransport } from "../../../src/packages/mcp/runtime/transports/stdio.ts";
import {
	type JsonRpcNotification,
	type JsonRpcRequest,
	type JsonRpcResponse,
	MCP_MAX_RESULT_BYTES,
	type MCPToolCallResult,
	type MCPTransport,
} from "../../../src/packages/mcp/runtime/types.ts";

// ============================================================================
// Server Name Sanitization
// ============================================================================

describe("sanitizeServerName", () => {
	it("should leave alphanumeric names unchanged", () => {
		expect(sanitizeServerName("myserver")).toBe("myserver");
		expect(sanitizeServerName("MyServer123")).toBe("MyServer123");
	});

	it("should replace non-alphanumeric characters with underscore", () => {
		expect(sanitizeServerName("my-server")).toBe("my_server");
		expect(sanitizeServerName("my.server")).toBe("my_server");
		expect(sanitizeServerName("my server")).toBe("my_server");
	});

	it("should collapse consecutive underscores", () => {
		expect(sanitizeServerName("my__server")).toBe("my_server");
		expect(sanitizeServerName("my---server")).toBe("my_server");
		expect(sanitizeServerName("my...server")).toBe("my_server");
	});

	it("should strip leading and trailing underscores", () => {
		expect(sanitizeServerName("_myserver")).toBe("myserver");
		expect(sanitizeServerName("myserver_")).toBe("myserver");
		expect(sanitizeServerName("__myserver__")).toBe("myserver");
	});

	it("should handle empty string", () => {
		expect(sanitizeServerName("")).toBe("unnamed");
	});

	it("should handle special characters only", () => {
		expect(sanitizeServerName("---")).toBe("unnamed");
		expect(sanitizeServerName("...")).toBe("unnamed");
	});
});

describe("isServerNameAmbiguous", () => {
	it("should detect ambiguous names", () => {
		expect(isServerNameAmbiguous("my__server", "my--server")).toBe(true);
		expect(isServerNameAmbiguous("my server", "my-server")).toBe(true);
	});

	it("should not flag identical names", () => {
		expect(isServerNameAmbiguous("myserver", "myserver")).toBe(false);
	});

	it("should not flag different names", () => {
		expect(isServerNameAmbiguous("server1", "server2")).toBe(false);
	});
});

// ============================================================================
// Tool Name Construction
// ============================================================================

describe("mcpToolName", () => {
	it("should construct proper MCP tool names", () => {
		expect(mcpToolName("myserver", "read_file")).toBe("mcp__myserver__read_file");
		expect(mcpToolName("github-api", "create_issue")).toBe("mcp__github_api__create_issue");
	});

	it("should sanitize server names", () => {
		expect(mcpToolName("my__server", "tool")).toBe("mcp__my_server__tool");
	});
});

describe("parseMcpToolName", () => {
	it("should parse MCP tool names", () => {
		expect(parseMcpToolName("mcp__myserver__read_file")).toEqual({
			serverName: "myserver",
			toolName: "read_file",
		});
	});

	it("should return null for non-MCP names", () => {
		expect(parseMcpToolName("bash")).toBeNull();
		expect(parseMcpToolName("read")).toBeNull();
	});

	it("should return null for names without double underscore separator", () => {
		expect(parseMcpToolName("mcp__server")).toBeNull();
	});
});

describe("isMcpToolName", () => {
	it("should identify MCP tool names", () => {
		expect(isMcpToolName("mcp__myserver__tool")).toBe(true);
		expect(isMcpToolName("bash")).toBe(false);
		expect(isMcpToolName("read")).toBe(false);
	});
});

// ============================================================================
// JSON Schema to TypeBox Conversion
// ============================================================================

describe("jsonSchemaToTypeBox", () => {
	it("should convert a simple object schema", () => {
		const schema = {
			type: "object" as const,
			properties: {
				name: { type: "string" as const },
				age: { type: "number" as const },
			},
			required: ["name"],
		};
		const result = jsonSchemaToTypeBox(schema);
		expect(result).toBeDefined();
		// TypeBox object with required properties
	});

	it("should handle empty schema", () => {
		const result = jsonSchemaToTypeBox({});
		expect(result).toBeDefined();
	});

	it("should handle null schema", () => {
		const result = jsonSchemaToTypeBox(null as unknown as Record<string, unknown>);
		expect(result).toBeDefined();
	});

	it("should convert string schemas", () => {
		const result = jsonSchemaToTypeBox({ type: "string" });
		expect(result).toBeDefined();
	});

	it("should convert number schemas", () => {
		const result = jsonSchemaToTypeBox({ type: "number" });
		expect(result).toBeDefined();
	});

	it("should convert boolean schemas", () => {
		const result = jsonSchemaToTypeBox({ type: "boolean" });
		expect(result).toBeDefined();
	});

	it("should convert array schemas", () => {
		const result = jsonSchemaToTypeBox({
			type: "array",
			items: { type: "string" },
		});
		expect(result).toBeDefined();
	});

	it("should convert enum schemas", () => {
		const result = jsonSchemaToTypeBox({
			type: "string",
			enum: ["a", "b", "c"],
		});
		expect(result).toBeDefined();
	});

	it("should fall back for $ref", () => {
		const result = jsonSchemaToTypeBox({ $ref: "#/definitions/Foo" });
		expect(result).toBeDefined();
	});

	it("should fall back for oneOf", () => {
		const result = jsonSchemaToTypeBox({
			oneOf: [{ type: "string" }, { type: "number" }],
		});
		expect(result).toBeDefined();
	});
});

// ============================================================================
// MCP Result Conversion
// ============================================================================

describe("mcpResultToText", () => {
	it("should convert text content blocks", () => {
		const result: MCPToolCallResult = {
			content: [
				{ type: "text", text: "Hello" },
				{ type: "text", text: "World" },
			],
		};
		expect(mcpResultToText(result)).toBe("Hello\nWorld");
	});

	it("should handle resource content blocks", () => {
		const result: MCPToolCallResult = {
			content: [{ type: "resource", resource: { uri: "file:///test.txt", text: "content" } }],
		};
		expect(mcpResultToText(result)).toContain("Resource");
	});

	it("should handle isError flag", () => {
		const result: MCPToolCallResult = {
			content: [{ type: "text", text: "Error occurred" }],
			isError: true,
		};
		expect(mcpResultToText(result)).toBe("Error occurred");
	});
});

// ============================================================================
// Result Truncation
// ============================================================================

describe("truncateMcpResult", () => {
	it("should not truncate small results", () => {
		const small = "Hello, world!";
		expect(truncateMcpResult(small)).toBe(small);
	});

	it("should truncate large results", () => {
		const large = "A".repeat(MCP_MAX_RESULT_BYTES + 1000);
		const result = truncateMcpResult(large);
		expect(result).toContain("[truncated:");
		// The truncated result should be significantly smaller than the original
		// (it takes first 100 lines + a temp file path message)
		expect(result.length).toBeLessThan(large.length / 2);
	});

	it("should include temp file path in truncated result", () => {
		const large = "B".repeat(MCP_MAX_RESULT_BYTES + 1000);
		const result = truncateMcpResult(large);
		expect(result).toContain("Full result written to:");
	});
});

// ============================================================================
// Config Loader
// ============================================================================

describe("loadMCPConfigFile", () => {
	const tmpDir = join(tmpdir(), "pi-mcp-test-config");

	beforeAll(() => {
		mkdirSync(tmpDir, { recursive: true });
	});

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should return null for non-existent file", () => {
		const result = loadMCPConfigFile(join(tmpDir, "nonexistent.json"));
		expect(result.config).toBeNull();
		expect(result.errors).toHaveLength(0);
	});

	it("should load a valid config", () => {
		const configPath = join(tmpDir, "valid.json");
		writeFileSync(
			configPath,
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					"test-server": {
						transport: {
							type: "stdio",
							command: "node",
							args: ["server.js"],
						},
					},
				},
			}),
		);

		const result = loadMCPConfigFile(configPath);
		expect(result.config).not.toBeNull();
		expect(result.config!.mcpServers["test-server"]).toBeDefined();
		expect(result.config!.mcpServers["test-server"].transport.type).toBe("stdio");
	});

	it("should handle common format with top-level command", () => {
		const configPath = join(tmpDir, "common-format.json");
		writeFileSync(
			configPath,
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					"test-server": {
						command: "npx",
						args: ["-y", "@modelcontextprotocol/server-filesystem"],
					},
				},
			}),
		);

		const result = loadMCPConfigFile(configPath);
		expect(result.config).not.toBeNull();
		expect(result.config!.mcpServers["test-server"].transport.type).toBe("stdio");
		// Should have a warning about common format
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("should reject invalid JSON", () => {
		const configPath = join(tmpDir, "invalid.json");
		writeFileSync(configPath, "not json {{{");

		const result = loadMCPConfigFile(configPath);
		expect(result.config).toBeNull();
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("should reject unsupported config version", () => {
		const configPath = join(tmpDir, "bad-version.json");
		writeFileSync(
			configPath,
			JSON.stringify({
				mcpConfigVersion: 99,
				mcpServers: {},
			}),
		);

		const result = loadMCPConfigFile(configPath);
		expect(result.config).toBeNull();
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("should warn about missing version", () => {
		const configPath = join(tmpDir, "no-version.json");
		writeFileSync(
			configPath,
			JSON.stringify({
				mcpServers: {},
			}),
		);

		const result = loadMCPConfigFile(configPath);
		expect(result.config).not.toBeNull();
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("should skip disabled servers", () => {
		const configPath = join(tmpDir, "disabled.json");
		writeFileSync(
			configPath,
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					disabled: {
						transport: { type: "stdio", command: "echo" },
						disabled: true,
					},
					enabled: {
						transport: { type: "stdio", command: "echo" },
					},
				},
			}),
		);

		const result = loadMCPConfigs({
			cwd: tmpDir,
			isProjectTrusted: true,
			globalMcpJsonPath: configPath,
		});
		expect(result.servers.has("disabled")).toBe(false);
		expect(result.servers.has("enabled")).toBe(true);
	});
});

describe("loadMCPConfigs", () => {
	const tmpDir = join(tmpdir(), "pi-mcp-test-configs");

	beforeAll(() => {
		mkdirSync(tmpDir, { recursive: true });
	});

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should merge global and project configs with project taking precedence", () => {
		const globalPath = join(tmpDir, "global.json");
		writeFileSync(
			globalPath,
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					globalOnly: { transport: { type: "stdio", command: "echo" } },
					shared: { transport: { type: "stdio", command: "global-echo" } },
				},
			}),
		);

		const _projectPath = join(tmpDir, "project-mcp.json");
		// Project config
		writeFileSync(
			join(tmpDir, ".mcp.json"),
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					projectOnly: { transport: { type: "stdio", command: "cat" } },
					shared: { transport: { type: "stdio", command: "project-echo" } },
				},
			}),
		);

		const result = loadMCPConfigs({
			cwd: tmpDir,
			isProjectTrusted: true,
			globalMcpJsonPath: globalPath,
		});

		expect(result.servers.has("globalOnly")).toBe(true);
		expect(result.servers.has("projectOnly")).toBe(true);
		const sharedTransport = result.servers.get("shared")!.transport;
		expect(sharedTransport.type === "stdio" && sharedTransport.command).toBe("project-echo");
		// Should warn about shared name
		expect(result.warnings.some((w) => w.includes("shared"))).toBe(true);
	});

	it("should not load project config when project is not trusted", () => {
		const globalPath = join(tmpDir, "global2.json");
		writeFileSync(
			globalPath,
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					globalOnly: { transport: { type: "stdio", command: "echo" } },
				},
			}),
		);

		// Create project config
		writeFileSync(
			join(tmpDir, ".mcp.json"),
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					projectOnly: { transport: { type: "stdio", command: "cat" } },
				},
			}),
		);

		const result = loadMCPConfigs({
			cwd: tmpDir,
			isProjectTrusted: false,
			globalMcpJsonPath: globalPath,
		});

		expect(result.servers.has("globalOnly")).toBe(true);
		expect(result.servers.has("projectOnly")).toBe(false);
	});
});

// ============================================================================
// validateMCPConfig
// ============================================================================

describe("validateMCPConfig", () => {
	it("should validate a proper config", () => {
		const config = {
			mcpConfigVersion: 1,
			mcpServers: {
				"test-server": {
					transport: { type: "stdio", command: "echo" },
				},
			},
		};

		const result = validateMCPConfig(config, "test.json");
		expect(result.config).not.toBeNull();
		expect(result.errors).toHaveLength(0);
	});

	it("should reject non-object config", () => {
		const result = validateMCPConfig("not an object", "test.json");
		expect(result.config).toBeNull();
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("should reject array config", () => {
		const result = validateMCPConfig([], "test.json");
		expect(result.config).toBeNull();
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("should accept HTTP transport config", () => {
		const config = {
			mcpConfigVersion: 1,
			mcpServers: {
				"remote-server": {
					transport: { type: "http", url: "http://localhost:8080/mcp" },
				},
			},
		};

		const result = validateMCPConfig(config, "test.json");
		expect(result.config).not.toBeNull();
		expect(result.config!.mcpServers["remote-server"].transport.type).toBe("http");
	});

	it("should reject invalid transport type", () => {
		const config = {
			mcpConfigVersion: 1,
			mcpServers: {
				bad: {
					transport: { type: "websocket", url: "ws://localhost" },
				},
			},
		};

		const result = validateMCPConfig(config, "test.json");
		expect(result.errors.length).toBeGreaterThan(0);
	});
});

// ============================================================================
// MCP Tool Definitions
// ============================================================================

describe("createMcpToolDefinitions", () => {
	it("should create tool definitions from MCP tools", () => {
		const tools = [
			{
				name: "read_file",
				description: "Read a file",
				inputSchema: {
					type: "object" as const,
					properties: {
						path: { type: "string" as const, description: "File path" },
					},
					required: ["path"],
				},
			},
			{
				name: "write_file",
				description: "Write a file",
				inputSchema: {
					type: "object" as const,
					properties: {
						path: { type: "string" as const },
						content: { type: "string" as const },
					},
					required: ["path", "content"],
				},
			},
		];

		// Create a mock client
		const mockClient = {
			callTool: async () => ({
				content: [{ type: "text" as const, text: "mock result" }],
				isError: false,
			}),
		} as unknown as MCPClient;

		const { definitions, warnings } = createMcpToolDefinitions("test-server", tools, mockClient);

		expect(definitions).toHaveLength(2);
		expect(definitions[0].name).toBe("mcp__test_server__read_file");
		expect(definitions[1].name).toBe("mcp__test_server__write_file");
		expect(warnings).toHaveLength(0);
	});

	it("should detect naming collisions", () => {
		// Two different servers that sanitize to the same name
		const tools = [
			{
				name: "read",
				description: "Read",
				inputSchema: { type: "object" as const },
			},
		];

		const mockClient = {
			callTool: async () => ({
				content: [{ type: "text" as const, text: "mock" }],
				isError: false,
			}),
		} as unknown as MCPClient;

		// First server: "my server"
		const result1 = createMcpToolDefinitions("my server", tools, mockClient);
		expect(result1.definitions[0].name).toBe("mcp__my_server__read");

		// Second server: "my__server" — same sanitized name
		const result2 = createMcpToolDefinitions("my__server", tools, mockClient);
		expect(result2.definitions[0].name).toBe("mcp__my_server__read");
		// This would produce a collision in the manager, which logs warnings
	});
});

// ============================================================================
// Stdio Transport
// ============================================================================

describe("StdioTransport", () => {
	const tmpDir = join(tmpdir(), "pi-mcp-transport-test");

	beforeAll(() => {
		mkdirSync(tmpDir, { recursive: true });
	});

	it("should fail to connect to a non-existent command", async () => {
		const transport = new StdioTransport({
			command: "nonexistent_command_that_does_not_exist_12345",
		});

		await expect(transport.connect()).rejects.toThrow();
		expect(transport.status).toBe("failed");
	});

	it("should connect and disconnect from echo command", async () => {
		const transport = new StdioTransport({
			command: "cat", // cat echoes stdin to stdout
		});

		await transport.connect();
		expect(transport.status).toBe("connected");

		await transport.disconnect();
		expect(transport.status).toBe("disconnected");
	});
});

// ============================================================================
// MCP Client Integration (with mock server)
// ============================================================================

describe("MCPClient with mock server", () => {
	// Skip these tests in CI where the mock server script may not be available
	const _mockServerPath = join(tmpdir(), "pi-mcp-test", "mock-mcp-server.mjs");

	it("starts optional HTTP SSE after initialize and before initialized notification", async () => {
		const calls: string[] = [];
		const transport: MCPTransport = {
			status: "disconnected",
			async connect() {
				calls.push("connect");
				this.status = "connected";
			},
			async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
				calls.push(`send:${request.method}`);
				if (request.method === "initialize") {
					return {
						jsonrpc: "2.0",
						id: request.id,
						result: {
							protocolVersion: "2025-03-26",
							capabilities: {},
							serverInfo: { name: "mock", version: "1.0.0" },
						},
					};
				}
				return { jsonrpc: "2.0", id: request.id, result: { tools: [] } };
			},
			async sendNotification(notification: JsonRpcNotification) {
				calls.push(`notify:${notification.method}`);
			},
			async startSSEListener() {
				calls.push("sse");
			},
			async disconnect() {
				this.status = "disconnected";
			},
			onEvent() {
				return () => undefined;
			},
		};

		const client = new MCPClient({ transport, serverName: "mock" });
		await client.connect();

		expect(calls).toEqual([
			"connect",
			"send:initialize",
			"sse",
			"notify:notifications/initialized",
			"send:tools/list",
		]);
	});

	// These tests require compiling the mock server first, so they may be skipped
	// in environments where TypeScript compilation isn't available.
	it.todo("should initialize and discover tools from mock server");
	it.todo("should call tools on mock server");
	it.todo("should handle server disconnection gracefully");
	it.todo("should handle zero-tool servers with a warning");
	it.todo("should handle server startup timeout");
	it.todo("should handle concurrent tool calls with multiplexed correlation");
	it.todo("should truncate results exceeding 1MB");
	it.todo("should handle special characters in server names");
});

// ============================================================================
// MCP Manager
// ============================================================================

describe("MCPManager", () => {
	const tmpDir = join(tmpdir(), "pi-mcp-manager-test");

	beforeAll(() => {
		mkdirSync(tmpDir, { recursive: true });
	});

	it("should initialize with empty config", async () => {
		const globalPath = join(tmpDir, "empty.json");
		writeFileSync(globalPath, JSON.stringify({ mcpConfigVersion: 1, mcpServers: {} }));

		const manager = new MCPManager({
			cwd: tmpDir,
			isProjectTrusted: true,
			globalMcpJsonPath: globalPath,
		});

		await manager.initialize();
		expect(manager.getServerInfos()).toHaveLength(0);
		expect(manager.getAllTools()).toHaveLength(0);

		await manager.stopAll();
	});

	it("should report errors for non-existent server commands", async () => {
		const globalPath = join(tmpDir, "bad-server.json");
		writeFileSync(
			globalPath,
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					"bad-server": {
						transport: {
							type: "stdio",
							command: "nonexistent_command_that_does_not_exist_12345",
						},
					},
				},
			}),
		);

		const manager = new MCPManager({
			cwd: tmpDir,
			isProjectTrusted: true,
			globalMcpJsonPath: globalPath,
		});

		await manager.initialize();
		expect(manager.errors.length).toBeGreaterThan(0);
		// Server should be in failed status
		const serverInfo = manager.getServerInfos().find((s) => s.name === "bad-server");
		expect(serverInfo?.status).toBe("failed");

		await manager.stopAll();
	}, 15000);
});

// ============================================================================
// HTTP Transport SSE Parser
// ============================================================================

describe("parseSseEvents", () => {
	it("should parse single SSE event", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('event: message\ndata: {"jsonrpc":"2.0","method":"test"}\n\n'));
				controller.close();
			},
		});

		const events: Array<{ event: string | null; data: string }> = [];
		for await (const sse of parseSseEvents(stream)) {
			events.push(sse);
		}

		expect(events).toHaveLength(1);
		expect(events[0].event).toBe("message");
		expect(events[0].data).toBe('{"jsonrpc":"2.0","method":"test"}');
	});

	it("should parse multi-line data fields", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("data: line1\ndata: line2\n\n"));
				controller.close();
			},
		});

		const events: Array<{ event: string | null; data: string }> = [];
		for await (const sse of parseSseEvents(stream)) {
			events.push(sse);
		}

		expect(events).toHaveLength(1);
		expect(events[0].data).toBe("line1\nline2");
		expect(events[0].event).toBeNull();
	});

	it("should parse multiple SSE events", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode("event: message\ndata: first\n\nevent: result\ndata: second\n\n"),
				);
				controller.close();
			},
		});

		const events: Array<{ event: string | null; data: string }> = [];
		for await (const sse of parseSseEvents(stream)) {
			events.push(sse);
		}

		expect(events).toHaveLength(2);
		expect(events[0].event).toBe("message");
		expect(events[0].data).toBe("first");
		expect(events[1].event).toBe("result");
		expect(events[1].data).toBe("second");
	});

	it("should ignore comments and empty data lines", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(": this is a comment\ndata: actual\n\n"));
				controller.close();
			},
		});

		const events: Array<{ event: string | null; data: string }> = [];
		for await (const sse of parseSseEvents(stream)) {
			events.push(sse);
		}

		expect(events).toHaveLength(1);
		expect(events[0].data).toBe("actual");
	});

	it("should handle incremental chunks", async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode("event: msg\nda"));
				controller.enqueue(encoder.encode('ta: {"ok":true}\n\n'));
				controller.close();
			},
		});

		const events: Array<{ event: string | null; data: string }> = [];
		for await (const sse of parseSseEvents(stream)) {
			events.push(sse);
		}

		expect(events).toHaveLength(1);
		expect(events[0].event).toBe("msg");
		expect(events[0].data).toBe('{"ok":true}');
	});

	it("should handle CRLF line endings", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("data: hello\r\n\r\n"));
				controller.close();
			},
		});

		const events: Array<{ event: string | null; data: string }> = [];
		for await (const sse of parseSseEvents(stream)) {
			events.push(sse);
		}

		expect(events).toHaveLength(1);
		expect(events[0].data).toBe("hello");
	});

	it("should respect abort signal", async () => {
		const controller = new AbortController();
		controller.abort();

		const stream = new ReadableStream({
			start(ctrl) {
				ctrl.enqueue(new TextEncoder().encode("data: never\n\n"));
				ctrl.close();
			},
		});

		const events: Array<{ event: string | null; data: string }> = [];
		for await (const sse of parseSseEvents(stream, controller.signal)) {
			events.push(sse);
		}

		expect(events).toHaveLength(0);
	});
});

// ============================================================================
// HTTP Transport
// ============================================================================

describe("HttpTransport", () => {
	it("should connect and report connected status", async () => {
		const transport = new HttpTransport({
			url: "http://127.0.0.1:1/does-not-exist",
		});

		// connect() doesn't verify the URL — it just sets status to connected
		await transport.connect();
		expect(transport.status).toBe("connected");

		await transport.disconnect();
		expect(transport.status).toBe("disconnected");
	});

	it("should return error response when sending to non-existent server", async () => {
		const transport = new HttpTransport({
			url: "http://127.0.0.1:1/does-not-exist",
			timeoutMs: 2000,
		});

		await transport.connect();

		const response = await transport.send({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {},
		});

		expect(response.jsonrpc).toBe("2.0");
		expect(response.id).toBe(1);
		// Either an error response from our transport or from the network
		if ("error" in response) {
			expect(response.error).toBeDefined();
		}

		await transport.disconnect();
	});

	it("should propagate Mcp-Session-Id from responses", async () => {
		// Start a mock HTTP server
		const { server, port } = await createMockHttpServer({
			handleRequest: async (body, res) => {
				res.setHeader("Mcp-Session-Id", "test-session-123");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { ok: true } }));
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				timeoutMs: 5000,
			});

			await transport.connect();

			const response = await transport.send({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
			});

			expect(transport.sessionId).toBe("test-session-123");
			expect("result" in response && response.result).toBeTruthy();

			await transport.disconnect();
		} finally {
			server.close();
		}
	});

	it("should handle SSE response from server", async () => {
		const { server, port } = await createMockHttpServer({
			handleRequest: async (body, res) => {
				res.writeHead(200, { "Content-Type": "text/event-stream" });
				res.write(
					`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [] } })}\n\n`,
				);
				res.end();
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				timeoutMs: 5000,
			});

			await transport.connect();

			const response = await transport.send({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list",
				params: {},
			});

			expect(response.jsonrpc).toBe("2.0");
			expect(response.id).toBe(1);
			expect("result" in response).toBe(true);

			await transport.disconnect();
		} finally {
			server.close();
		}
	});

	it("should start SSE listener without waiting for stream end", async () => {
		let getReceived = false;
		const { server, port } = await createMockHttpServer({
			handleRequest: async (body, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
			},
			handleGet: (res) => {
				getReceived = true;
				res.writeHead(200, { "Content-Type": "text/event-stream" });
				res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/test" })}\n\n`);
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				timeoutMs: 5000,
			});
			await transport.connect();

			await expect(Promise.race([transport.startSSEListener(), timeoutReject(500)])).resolves.toBeUndefined();
			expect(getReceived).toBe(true);

			await transport.disconnect();
		} finally {
			server.close();
		}
	});

	it("should handle server errors gracefully", async () => {
		const { server, port } = await createMockHttpServer({
			handleRequest: async (_body, res) => {
				res.writeHead(500, { "Content-Type": "text/plain" });
				res.end("Internal Server Error");
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				timeoutMs: 5000,
			});

			await transport.connect();

			const response = await transport.send({
				jsonrpc: "2.0",
				id: 1,
				method: "test",
				params: {},
			});

			expect("error" in response).toBe(true);
			expect((response as { error: { code: number } }).error.code).toBe(-32000);

			await transport.disconnect();
		} finally {
			server.close();
		}
	});

	it("should send Mcp-Session-Id header when present", async () => {
		let receivedSessionId: string | null = null;

		const { server, port } = await createMockHttpServer({
			handleRequest: async (body, res) => {
				res.writeHead(200, { "Content-Type": "application/json", "Mcp-Session-Id": "my-session-id" });
				res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
			},
			captureHeaders: (headers) => {
				receivedSessionId = headers["mcp-session-id"] ?? null;
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				timeoutMs: 5000,
			});

			await transport.connect();

			// First request — no session ID yet
			await transport.send({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {},
			});

			expect(receivedSessionId).toBeNull();

			await transport.send({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			});

			expect(receivedSessionId).toBe("my-session-id");

			await transport.disconnect();
		} finally {
			server.close();
		}
	});

	it("should send DELETE on disconnect with session ID", async () => {
		let deleteReceived = false;

		const { server, port } = await createMockHttpServer({
			handleRequest: async (_body, res) => {
				res.writeHead(200, { "Content-Type": "application/json", "Mcp-Session-Id": "session-to-delete" });
				res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));
			},
			handleDelete: () => {
				deleteReceived = true;
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				timeoutMs: 5000,
			});

			await transport.connect();

			await transport.send({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {},
			});

			await transport.disconnect();
			expect(deleteReceived).toBe(true);
		} finally {
			server.close();
		}
	});

	it("should handle concurrent requests with id-based correlation", async () => {
		let _requestCount = 0;

		const { server, port } = await createMockHttpServer({
			handleRequest: async (body, res) => {
				_requestCount++;
				// Delay response to allow concurrent requests
				const delay = body.id === 1 ? 50 : 10;
				await new Promise((resolve) => setTimeout(resolve, delay));
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { request: body.id } }));
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				timeoutMs: 5000,
			});

			await transport.connect();

			// Send two concurrent requests
			const [response1, response2] = await Promise.all([
				transport.send({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: {},
				}),
				transport.send({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/call",
					params: { name: "test" },
				}),
			]);

			expect(response1.id).toBe(1);
			expect(response2.id).toBe(2);
			expect("result" in response1).toBe(true);
			expect("result" in response2).toBe(true);

			await transport.disconnect();
		} finally {
			server.close();
		}
	});

	it("should handle notifications via POST", async () => {
		let receivedMethod: string | null = null;

		const { server, port } = await createMockHttpServer({
			handleRequest: async (body, res) => {
				if (body.method && typeof body.method === "string") {
					receivedMethod = body.method;
				}
				res.writeHead(202, {}); // 202 Accepted for notifications
				res.end();
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				timeoutMs: 5000,
			});

			await transport.connect();

			await transport.sendNotification({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			});

			// Give the notification time to be sent
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(receivedMethod).toBe("notifications/initialized");

			await transport.disconnect();
		} finally {
			server.close();
		}
	});

	it("should handle SSE stream interruption", async () => {
		const _events: Array<{ event: string | null; data: string }> = [];

		const { server, port } = await createMockHttpServer({
			handleRequest: async (body, res) => {
				// Respond with an SSE stream that sends a result then closes
				res.writeHead(200, { "Content-Type": "text/event-stream" });
				const result = JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { ok: true } });
				res.write(`data: ${result}\n\n`);
				res.end();
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				timeoutMs: 5000,
			});

			await transport.connect();

			const response = await transport.send({
				jsonrpc: "2.0",
				id: 1,
				method: "test",
				params: {},
			});

			expect(response.id).toBe(1);
			expect("result" in response).toBe(true);

			await transport.disconnect();
		} finally {
			server.close();
		}
	});

	it("should support custom headers", async () => {
		let receivedAuth: string | null = null;

		const { server, port } = await createMockHttpServer({
			handleRequest: async (body, res) => {
				void body;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
			},
			captureHeaders: (headers) => {
				receivedAuth = headers.authorization ?? null;
			},
		});

		try {
			const transport = new HttpTransport({
				url: `http://127.0.0.1:${port}/mcp`,
				headers: { Authorization: "Bearer test-token" },
				timeoutMs: 5000,
			});

			await transport.connect();

			await transport.send({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {},
			});

			expect(receivedAuth).toBe("Bearer test-token");

			await transport.disconnect();
		} finally {
			server.close();
		}
	});
});

function timeoutReject(ms: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
	});
}

// ============================================================================
// Mock HTTP Server Helper
// ============================================================================

/**
 * Create a minimal HTTP server for testing the HTTP transport.
 * Returns the server instance and the assigned port.
 */
async function createMockHttpServer(options: {
	handleRequest: (body: Record<string, unknown>, res: ServerResponse) => Promise<void>;
	captureHeaders?: (headers: Record<string, string>) => void;
	handleDelete?: () => void;
	handleGet?: (res: ServerResponse) => void;
}): Promise<{ server: Server; port: number }> {
	const server = createServer((req, res) => {
		if (req.method === "DELETE") {
			options.handleDelete?.();
			res.writeHead(200);
			res.end();
			return;
		}

		if (req.method === "GET") {
			if (options.handleGet) {
				options.handleGet(res);
				return;
			}
			// SSE listener — return 405 since our mock doesn't support SSE GET
			res.writeHead(405);
			res.end();
			return;
		}

		// POST — parse JSON body
		let body = "";
		const headers: Record<string, string> = {};
		for (let i = 0; i < req.rawHeaders.length; i += 2) {
			headers[req.rawHeaders[i]!.toLowerCase()] = req.rawHeaders[i + 1]!;
		}
		options.captureHeaders?.(headers);

		req.on("data", (chunk: Buffer) => {
			body += chunk.toString();
		});

		req.on("end", () => {
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(body);
			} catch {
				parsed = {};
			}

			options.handleRequest(parsed, res).catch((err) => {
				res.writeHead(500, { "Content-Type": "text/plain" });
				res.end(err instanceof Error ? err.message : "Internal error");
			});
		});
	});

	return new Promise((resolve) => {
		server.listen(0, () => {
			const addr = server.address();
			const port = addr && typeof addr === "object" ? addr.port : 0;
			resolve({ server, port });
		});
	});
}
