/**
 * MCP CLI subcommand — `pi mcp <verb> [args]`
 *
 * Verbs:
 *   list       — Show configured MCP servers and their transport type
 *   add        — Add a server to project .mcp.json
 *   remove     — Remove a server from project .mcp.json
 *   test       — Test connectivity to a configured server
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MCPClient } from "../runtime/client.ts";
import { loadMCPConfigFile } from "../runtime/loader.ts";
import { HttpTransport } from "../runtime/transports/http.ts";
import { StdioTransport } from "../runtime/transports/stdio.ts";
import type { MCPConfigFile, MCPServerConfig, MCPServerTransport } from "../runtime/types.ts";

interface McpCommandResult {
	status: number;
	stdout: string;
	stderr: string;
}

function usage(): string {
	return `Usage:
  pi mcp list [--json]                    List configured MCP servers
  pi mcp add <name> --command <cmd> [--args ...] [--env KEY=VAL ...]
  pi mcp add <name> --url <url>
  pi mcp remove <name>                    Remove a server from .mcp.json
  pi mcp test <name> [--timeout <sec>]    Test connectivity to a server

Config files:
  Project: .mcp.json (in cwd)
  Global:  ~/.pi/mcp.json
`;
}

function projectMcpPath(cwd: string): string {
	return join(cwd, ".mcp.json");
}

function globalMcpPath(): string {
	return join(homedir(), ".pi", "mcp.json");
}

async function readConfigFile(path: string): Promise<MCPConfigFile> {
	if (!existsSync(path)) return { mcpConfigVersion: 1, mcpServers: {} };
	const raw = await readFile(path, "utf8");
	const parsed = JSON.parse(raw) as MCPConfigFile;
	if (!parsed.mcpServers) return { mcpConfigVersion: 1, mcpServers: {} };
	return parsed;
}

async function writeConfigFile(path: string, config: MCPConfigFile): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function transportType(transport: MCPServerTransport): string {
	if ("command" in transport) return "stdio";
	if ("url" in transport) return "http";
	return "unknown";
}

function transportSummary(transport: MCPServerTransport): string {
	if ("command" in transport) {
		return `stdio: ${transport.command}${transport.args?.length ? ` ${transport.args.join(" ")}` : ""}`;
	}
	if ("url" in transport) {
		return `http: ${transport.url}`;
	}
	return "unknown";
}

async function listServers(cwd: string, json: boolean): Promise<McpCommandResult> {
	const projectPath = projectMcpPath(cwd);
	const globalPath = globalMcpPath();

	const projectResult = loadMCPConfigFile(projectPath);
	const globalResult = loadMCPConfigFile(globalPath);

	const servers: Array<{
		name: string;
		scope: string;
		transport: string;
		details: string;
		disabled: boolean;
	}> = [];

	if (globalResult.config) {
		for (const [name, config] of Object.entries(globalResult.config.mcpServers)) {
			servers.push({
				name,
				scope: "global",
				transport: transportType(config.transport),
				details: transportSummary(config.transport),
				disabled: config.disabled ?? false,
			});
		}
	}

	if (projectResult.config) {
		for (const [name, config] of Object.entries(projectResult.config.mcpServers)) {
			const existing = servers.findIndex((s) => s.name === name);
			if (existing >= 0) {
				servers[existing] = {
					name,
					scope: "project (overrides global)",
					transport: transportType(config.transport),
					details: transportSummary(config.transport),
					disabled: config.disabled ?? false,
				};
			} else {
				servers.push({
					name,
					scope: "project",
					transport: transportType(config.transport),
					details: transportSummary(config.transport),
					disabled: config.disabled ?? false,
				});
			}
		}
	}

	if (servers.length === 0) {
		return {
			status: 0,
			stdout: json ? "[]\n" : "No MCP servers configured.\n",
			stderr: "",
		};
	}

	if (json) {
		return { status: 0, stdout: `${JSON.stringify(servers, null, 2)}\n`, stderr: "" };
	}

	const lines = servers.map(
		(s) => `  ${s.disabled ? "[disabled] " : ""}${s.name} (${s.scope}, ${s.transport})\n    ${s.details}`,
	);
	return { status: 0, stdout: `MCP servers:\n${lines.join("\n")}\n`, stderr: "" };
}

function parseAddArgs(args: string[]): {
	name: string;
	command?: string;
	commandArgs?: string[];
	url?: string;
	env?: Record<string, string>;
} {
	const result: {
		name: string;
		command?: string;
		commandArgs?: string[];
		url?: string;
		env?: Record<string, string>;
	} = {
		name: "",
	};
	let i = 0;
	const cmdArgs: string[] = [];
	let inArgs = false;

	while (i < args.length) {
		const arg = args[i];
		if (arg === "--command") {
			const value = args[++i];
			if (!value) throw new Error("--command requires a value");
			result.command = value;
			inArgs = true;
			i++;
			continue;
		}
		if (arg === "--url") {
			const value = args[++i];
			if (!value) throw new Error("--url requires a value");
			result.url = value;
			inArgs = false;
			i++;
			continue;
		}
		if (arg === "--env") {
			const kv = args[++i];
			if (!kv) throw new Error("--env requires KEY=VALUE");
			const eq = kv.indexOf("=");
			if (eq <= 0) throw new Error("--env requires KEY=VALUE");
			result.env = { ...(result.env ?? {}), [kv.slice(0, eq)]: kv.slice(eq + 1) };
			i++;
			continue;
		}
		if (arg === "--args") {
			inArgs = true;
			i++;
			continue;
		}
		if (arg.startsWith("--")) throw new Error(`unknown option: ${arg}`);
		if (!result.name) {
			result.name = arg;
			i++;
			continue;
		}
		if (inArgs) cmdArgs.push(arg);
		i++;
	}

	if (cmdArgs.length > 0) result.commandArgs = cmdArgs;
	return result;
}

async function addServer(args: string[], cwd: string): Promise<McpCommandResult> {
	const parsed = parseAddArgs(args);
	if (!parsed.name) throw new Error("server name is required");
	if (!parsed.command && !parsed.url) throw new Error("either --command or --url is required");
	if (parsed.command && parsed.url) throw new Error("--command and --url are mutually exclusive");

	const configPath = projectMcpPath(cwd);
	const config = await readConfigFile(configPath);

	const serverConfig: MCPServerConfig = {
		transport: parsed.command
			? { type: "stdio", command: parsed.command, args: parsed.commandArgs, env: parsed.env }
			: { type: "http", url: parsed.url as string },
	};

	config.mcpServers[parsed.name] = serverConfig;
	await writeConfigFile(configPath, config);

	return {
		status: 0,
		stdout: `Added MCP server "${parsed.name}" to ${configPath}\n`,
		stderr: "",
	};
}

async function removeServer(args: string[], cwd: string): Promise<McpCommandResult> {
	const name = args[0];
	if (!name) throw new Error("server name is required");

	const configPath = projectMcpPath(cwd);
	const config = await readConfigFile(configPath);

	if (!config.mcpServers[name]) {
		return { status: 1, stdout: "", stderr: `Server "${name}" not found in ${configPath}\n` };
	}

	delete config.mcpServers[name];
	await writeConfigFile(configPath, config);

	return { status: 0, stdout: `Removed MCP server "${name}" from ${configPath}\n`, stderr: "" };
}

async function testServer(args: string[], cwd: string): Promise<McpCommandResult> {
	const name = args[0];
	if (!name) throw new Error("server name is required");

	const timeoutSec = extractTimeout(args);
	const projectResult = loadMCPConfigFile(projectMcpPath(cwd));
	const globalResult = loadMCPConfigFile(globalMcpPath());

	let serverConfig: MCPServerConfig | undefined;
	let scope = "";
	if (projectResult.config?.mcpServers[name]) {
		serverConfig = projectResult.config.mcpServers[name];
		scope = "project";
	} else if (globalResult.config?.mcpServers[name]) {
		serverConfig = globalResult.config.mcpServers[name];
		scope = "global";
	}

	if (!serverConfig) {
		return { status: 1, stdout: "", stderr: `Server "${name}" not found in project or global config\n` };
	}

	const transport = serverConfig.transport;
	let mcpTransport: StdioTransport | HttpTransport;
	if ("command" in transport) {
		mcpTransport = new StdioTransport({
			command: transport.command,
			args: transport.args,
			env: transport.env,
		});
	} else if ("url" in transport) {
		mcpTransport = new HttpTransport({
			url: transport.url,
			headers: transport.headers,
			timeoutMs: timeoutSec * 1000,
		});
	} else {
		return { status: 1, stdout: "", stderr: `Unknown transport type for server "${name}"\n` };
	}

	const client = new MCPClient({ transport: mcpTransport, serverName: name, startupTimeoutSec: timeoutSec });

	try {
		await client.connect();
		const tools = await client.refreshTools();

		const lines = [
			`Server: ${name} (${scope})`,
			`Transport: ${transportType(transport)}`,
			`Status: connected`,
			`Tools: ${tools.length}`,
		];
		if (tools.length > 0) {
			lines.push(`Tool names: ${tools.map((t) => t.name).join(", ")}`);
		}
		return { status: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			status: 1,
			stdout: `Server: ${name} (${scope})\nTransport: ${transportType(transport)}\nStatus: failed\nError: ${message}\n`,
			stderr: "",
		};
	} finally {
		await client.disconnect().catch(() => undefined);
		await mcpTransport.disconnect().catch(() => undefined);
	}
}

function extractTimeout(args: string[]): number {
	const idx = args.indexOf("--timeout");
	if (idx >= 0 && args[idx + 1]) {
		const n = Number.parseInt(args[idx + 1], 10);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return 30;
}

export async function handleMcpCommand(args: string[]): Promise<boolean> {
	if (args[0] !== "mcp") return false;
	const subArgs = args.slice(1);
	const verb = subArgs[0];
	const cwd = process.cwd();

	let result: McpCommandResult;
	try {
		switch (verb) {
			case "list":
				result = await listServers(cwd, subArgs.includes("--json"));
				break;
			case "add":
				result = await addServer(subArgs.slice(1), cwd);
				break;
			case "remove":
				result = await removeServer(subArgs.slice(1), cwd);
				break;
			case "test":
				result = await testServer(subArgs.slice(1), cwd);
				break;
			case "--help":
			case "-h":
			case undefined:
				result = { status: 0, stdout: usage(), stderr: "" };
				break;
			default:
				result = { status: 1, stdout: "", stderr: `Unknown mcp verb: ${verb}\n\n${usage()}` };
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		result = { status: 1, stdout: "", stderr: `Error: ${message}\n` };
	}

	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exitCode = result.status;
	return true;
}
