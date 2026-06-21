import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_LSP_SERVERS } from "./defaults.ts";
import type {
	DocumentSymbol,
	Location,
	LocationLink,
	Position,
	Range,
	ServerConfig,
	SymbolInformation,
} from "./types.ts";

const EXTENSION_LANGUAGE_IDS: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescriptreact",
	".js": "javascript",
	".jsx": "javascriptreact",
	".mjs": "javascript",
	".cjs": "javascript",
	".rs": "rust",
	".py": "python",
};

const SYMBOL_KINDS: Record<number, string> = {
	1: "File",
	2: "Module",
	3: "Namespace",
	4: "Package",
	5: "Class",
	6: "Method",
	7: "Property",
	8: "Field",
	9: "Constructor",
	10: "Enum",
	11: "Interface",
	12: "Function",
	13: "Variable",
	14: "Constant",
	15: "String",
	16: "Number",
	17: "Boolean",
	18: "Array",
	19: "Object",
	20: "Key",
	21: "Null",
	22: "EnumMember",
	23: "Struct",
	24: "Event",
	25: "Operator",
	26: "TypeParameter",
};

export function commandExists(command: string): boolean {
	const result = spawnSync(command, ["--version"], { stdio: "ignore" });
	return !result.error;
}

export function fileToUri(path: string): string {
	return pathToFileURL(path).href;
}

function uriToFile(uri: string): string {
	return fileURLToPath(uri);
}

export function detectLanguageId(path: string, server: ServerConfig): string {
	const extensionLanguageId = EXTENSION_LANGUAGE_IDS[extname(path)];
	const fallbackLanguageId = extname(path).slice(1);
	return (server.languageId ?? extensionLanguageId ?? fallbackLanguageId) || "plaintext";
}

export function findServerForFile(path: string): [string, ServerConfig] | undefined {
	const extension = extname(path);
	return Object.entries(DEFAULT_LSP_SERVERS).find(([, server]) => server.fileTypes.includes(extension));
}

export function findProjectRoot(filePath: string, cwd: string, server: ServerConfig): string {
	let dir = resolve(filePath);
	if (!dir.endsWith(sep)) dir = dir.slice(0, dir.lastIndexOf(sep)) || sep;
	const stop = resolve(cwd);
	while (true) {
		if (server.rootMarkers.some((marker) => existsSync(join(dir, marker)))) return dir;
		if (dir === stop || dir === sep) return stop;
		dir = dir.slice(0, dir.lastIndexOf(sep)) || sep;
	}
}

function toLspPosition(line: number, character: number): Position {
	return { line: Math.max(0, line - 1), character: Math.max(0, character - 1) };
}

export function findPositionInText(
	text: string,
	line: number | undefined,
	symbol: string | undefined,
): Position | undefined {
	if (line === undefined) return undefined;
	const lines = text.split("\n");
	const lineText = lines[line - 1] ?? "";
	const symbolIndex = symbol ? lineText.indexOf(symbol) : -1;
	return toLspPosition(line, symbolIndex >= 0 ? symbolIndex + 1 : 1);
}

function formatRange(range: Range): string {
	return `${range.start.line + 1}:${range.start.character + 1}`;
}

export function formatLocation(value: Location | LocationLink): string {
	if ("targetUri" in value) {
		return `${uriToFile(value.targetUri)}:${formatRange(value.targetSelectionRange ?? value.targetRange)}`;
	}
	return `${uriToFile(value.uri)}:${formatRange(value.range)}`;
}

export function formatSymbol(symbol: DocumentSymbol | SymbolInformation, indent = 0): string[] {
	const prefix = "  ".repeat(indent);
	const kind = SYMBOL_KINDS[symbol.kind] ?? `Kind${symbol.kind}`;
	if ("location" in symbol) {
		return [`${prefix}${kind} ${symbol.name} ${formatLocation(symbol.location)}`];
	}
	const lines = [`${prefix}${kind} ${symbol.name} ${formatRange(symbol.selectionRange)}`];
	for (const child of symbol.children ?? []) lines.push(...formatSymbol(child, indent + 1));
	return lines;
}

export function extractHoverText(contents: unknown): string {
	if (typeof contents === "string") return contents;
	if (Array.isArray(contents)) return contents.map(extractHoverText).filter(Boolean).join("\n\n");
	if (contents && typeof contents === "object") {
		const record = contents as Record<string, unknown>;
		if (typeof record.value === "string") return record.value;
		if (typeof record.language === "string" && typeof record.value === "string") return record.value;
	}
	return JSON.stringify(contents, null, 2);
}
