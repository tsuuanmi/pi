import { spawnSync } from "node:child_process";
import { readFile as fsReadFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { resolveToCwd } from "../tools/path-utils.ts";
import { str } from "../tools/render-utils.ts";
import { wrapToolDefinition } from "../tools/tool-definition-wrapper.ts";
import { LspSession } from "./client.ts";
import { DEFAULT_LSP_SERVERS } from "./defaults.ts";
import type {
	Diagnostic,
	DocumentSymbol,
	Hover,
	Location,
	LocationLink,
	ServerConfig,
	SymbolInformation,
} from "./types.ts";
import {
	commandExists,
	detectLanguageId,
	extractHoverText,
	fileToUri,
	findPositionInText,
	findProjectRoot,
	findServerForFile,
	formatLocation,
	formatSymbol,
} from "./utils.ts";

const lspSchema = Type.Object({
	action: Type.Union([
		Type.Literal("status"),
		Type.Literal("diagnostics"),
		Type.Literal("symbols"),
		Type.Literal("hover"),
		Type.Literal("definition"),
		Type.Literal("references"),
	]),
	file: Type.Optional(Type.String({ description: "File path for file-specific LSP actions" })),
	line: Type.Optional(Type.Number({ description: "1-indexed line number for position-specific actions" })),
	symbol: Type.Optional(
		Type.String({ description: "Symbol substring on the target line, used to choose the column" }),
	),
	timeout: Type.Optional(Type.Number({ description: "Request timeout in seconds, clamped to 5-60" })),
});

export type LspToolInput = Static<typeof lspSchema>;

export interface LspToolDetails {
	action: string;
	serverName?: string;
}

interface PreparedLspSession {
	session: LspSession;
	serverName: string;
	server: ServerConfig;
	absolutePath: string;
	uri: string;
	text: string;
	diagnostics: Diagnostic[];
}

function clampTimeoutSeconds(timeout: number | undefined): number {
	if (timeout === undefined || !Number.isFinite(timeout)) return 20;
	return Math.max(5, Math.min(60, Math.floor(timeout)));
}

function findLocalCommand(command: string, startDir: string, stopDir?: string): string | undefined {
	let dir = startDir;
	while (true) {
		const localCommand = join(dir, "node_modules", ".bin", command);
		if (commandExists(localCommand)) return localCommand;
		if (dir === stopDir || dir === dirname(dir)) return undefined;
		dir = dirname(dir);
	}
}

function findRustupRustAnalyzer(): string | undefined {
	const result = spawnSync("rustup", ["which", "rust-analyzer"], { encoding: "utf-8" });
	if (result.status !== 0) return undefined;
	const command = result.stdout.trim();
	return command && commandExists(command) ? command : undefined;
}

function resolveServerCommand(server: ServerConfig, root: string, cwd: string): ServerConfig {
	const projectCommand = findLocalCommand(server.command, root, cwd) ?? findLocalCommand(server.command, cwd, cwd);
	if (projectCommand) return { ...server, command: projectCommand };
	const packageCommand = findLocalCommand(server.command, dirname(fileURLToPath(import.meta.url)));
	if (packageCommand) return { ...server, command: packageCommand };
	if (server.command === "rust-analyzer") {
		const rustupCommand = findRustupRustAnalyzer();
		if (rustupCommand) return { ...server, command: rustupCommand };
	}
	return server;
}

function formatDiagnostic(diagnostic: Diagnostic): string {
	const severity = diagnostic.severity === 1 ? "error" : diagnostic.severity === 2 ? "warning" : "info";
	const source = diagnostic.source ? `${diagnostic.source}: ` : "";
	return `${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1} ${severity} ${source}${diagnostic.message}`;
}

function getStatus(cwd: string): string {
	const lines = ["Configured LSP servers:"];
	for (const [name, server] of Object.entries(DEFAULT_LSP_SERVERS)) {
		const rootServer = resolveServerCommand(server, cwd, cwd);
		const available = commandExists(rootServer.command) || commandExists(server.command);
		lines.push(
			`- ${name}: ${available ? "available" : "missing"} (${server.command}) for ${server.fileTypes.join(", ")}`,
		);
	}
	return lines.join("\n");
}

function requirePosition(action: string, text: string, line: number | undefined, symbol: string | undefined) {
	const position = findPositionInText(text, line, symbol);
	if (!position) throw new Error(`lsp action '${action}' requires a line number.`);
	return position;
}

async function prepareSession(cwd: string, input: LspToolInput): Promise<PreparedLspSession> {
	if (!input.file) throw new Error(`lsp action '${input.action}' requires a file path.`);
	const absolutePath = resolveToCwd(input.file, cwd);
	const entry = findServerForFile(absolutePath);
	if (!entry) throw new Error(`No default LSP server is configured for ${input.file}.`);
	const [serverName, configuredServer] = entry;
	const root = findProjectRoot(absolutePath, cwd, configuredServer);
	const server = resolveServerCommand(configuredServer, root, cwd);
	if (!commandExists(server.command)) {
		throw new Error(
			`LSP server '${serverName}' is not available. Install '${configuredServer.command}' or add it to PATH.`,
		);
	}
	const text = await fsReadFile(absolutePath, "utf-8");
	const uri = fileToUri(absolutePath);
	const diagnostics: Diagnostic[] = [];
	const timeoutMs = clampTimeoutSeconds(input.timeout) * 1000;
	const session = new LspSession(server, {
		rootPath: root,
		rootUri: fileToUri(root),
		workspaceName: basename(root) || "workspace",
		timeoutMs,
		onDiagnostics: (diagnosticUri, nextDiagnostics) => {
			if (diagnosticUri === uri) {
				diagnostics.splice(0, diagnostics.length, ...nextDiagnostics);
			}
		},
	});
	try {
		await session.initialize(server);
		session.openFile(uri, detectLanguageId(absolutePath, server), text);
		return { session, serverName, server, absolutePath, uri, text, diagnostics };
	} catch (error) {
		await session.close();
		throw error;
	}
}

function formatLocations(result: unknown): string {
	const values = Array.isArray(result) ? result : result ? [result] : [];
	if (values.length === 0) return "No locations found.";
	return values.map((value) => formatLocation(value as Location | LocationLink)).join("\n");
}

function formatSymbols(result: unknown): string {
	if (!Array.isArray(result) || result.length === 0) return "No symbols found.";
	return result.flatMap((symbol) => formatSymbol(symbol as DocumentSymbol | SymbolInformation)).join("\n");
}

function formatHover(result: unknown): string {
	if (!result) return "No hover information found.";
	return extractHoverText((result as Hover).contents);
}

async function runLspAction(cwd: string, input: LspToolInput): Promise<{ output: string; serverName?: string }> {
	if (input.action === "status") return { output: getStatus(cwd) };
	const prepared = await prepareSession(cwd, input);
	try {
		const textDocument = { uri: prepared.uri };
		if (input.action === "diagnostics") {
			await prepared.session.waitForDiagnostics();
			return {
				output:
					prepared.diagnostics.length === 0
						? `No diagnostics for ${prepared.absolutePath}.`
						: prepared.diagnostics.map(formatDiagnostic).join("\n"),
				serverName: prepared.serverName,
			};
		}
		if (input.action === "symbols") {
			const result = await prepared.session.request("textDocument/documentSymbol", { textDocument });
			return { output: formatSymbols(result), serverName: prepared.serverName };
		}
		const position = requirePosition(input.action, prepared.text, input.line, input.symbol);
		if (input.action === "hover") {
			const result = await prepared.session.request("textDocument/hover", { textDocument, position });
			return { output: formatHover(result), serverName: prepared.serverName };
		}
		if (input.action === "definition") {
			const result = await prepared.session.request("textDocument/definition", { textDocument, position });
			return { output: formatLocations(result), serverName: prepared.serverName };
		}
		const result = await prepared.session.request("textDocument/references", {
			textDocument,
			position,
			context: { includeDeclaration: true },
		});
		return { output: formatLocations(result), serverName: prepared.serverName };
	} finally {
		await prepared.session.close();
	}
}

function formatLspCall(args: { action?: string; file?: string }): string {
	const suffix = args.file ? ` ${args.file}` : "";
	return `lsp ${str(args.action)}${suffix}`;
}

export function createLspToolDefinition(cwd: string): ToolDefinition<typeof lspSchema, LspToolDetails | undefined> {
	return {
		name: "lsp",
		label: "lsp",
		description:
			"Query Language Server Protocol servers for code intelligence. Supports status, diagnostics, document symbols, hover, definition, and references. Uses installed language servers for TypeScript/JavaScript, Python, and Rust.",
		promptSnippet: "Query language servers for diagnostics, symbols, hover, definitions, and references",
		promptGuidelines: [
			"Use lsp for code intelligence when a supported language server is available, especially diagnostics, symbols, definitions, and references.",
		],
		parameters: lspSchema,
		executionMode: "sequential",
		async execute(_toolCallId, input, signal) {
			if (signal?.aborted) throw new Error("Operation aborted");
			const { output, serverName } = await runLspAction(cwd, input);
			return { content: [{ type: "text", text: output }], details: { action: input.action, serverName } };
		},
		renderCall(args, _theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatLspCall(args));
			return text;
		},
	};
}

export function createLspTool(cwd: string): AgentTool<typeof lspSchema> {
	return wrapToolDefinition(createLspToolDefinition(cwd));
}
