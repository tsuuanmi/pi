import { lstat, readdir } from "node:fs/promises";
import type { Tool } from "@tsuuanmi/pi-agent";
import { attachToolReceipt, createToolReceipt } from "@tsuuanmi/pi-agent";
import type { Theme } from "@tsuuanmi/pi-tui";
import { keyHint, Text } from "@tsuuanmi/pi-tui";
import path from "path";
import { type Static, Type } from "typebox";
import { toTool } from "#pi/tool/adapter";
import { getTextOutput, invalidArgText, shortenPath, str } from "#pi/tool/output";
import type { PiToolSpec, ToolRenderResultOptions } from "#pi/tool/spec";
import { resolveToCwd } from "#pi/tools/paths";

const DEFAULT_MAX_FILES = 500;
const SKIP_DIRS = new Set([".git", ".svn", ".hg", "node_modules", ".next", "dist", "build"]);

const globSchema = Type.Object(
	{
		path: Type.Optional(Type.String({ description: "Directory or file path to list (default: current directory)" })),
		pattern: Type.Optional(
			Type.String({
				description:
					"Filename glob to match, e.g. '*.ts' or '**/*.json'. When omitted, all files under the path are listed.",
			}),
		),
		maxFiles: Type.Optional(
			Type.Number({ description: `Maximum number of file paths to return (default: ${DEFAULT_MAX_FILES})` }),
		),
	},
	{ additionalProperties: false },
);

export type GlobToolInput = Static<typeof globSchema>;

export interface GlobToolDetails {
	resultLimitReached?: number;
}

/**
 * Pluggable operations for the glob tool.
 * Override these to delegate file listing to remote systems (for example SSH).
 */
export interface GlobOperations {
	/** List files matching an optional glob pattern. Returns relative or absolute paths. */
	listFiles: (
		absolutePath: string,
		pattern: string | undefined,
		options: { maxFiles: number; signal?: AbortSignal },
	) => Promise<string[]> | string[];
}

export interface GlobToolOptions {
	/** Custom operations for glob. Default: local filesystem recursive walk. */
	operations?: GlobOperations;
}

function toPosixPath(value: string): string {
	return value.split(path.sep).join("/");
}

export function matchesGlob(filename: string, glob: string): boolean {
	const normalizedGlob = glob.startsWith("**/") ? glob.slice(3) : glob;
	const regexSource = normalizedGlob
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	const regex = new RegExp(`^${regexSource}$`, "i");
	return regex.test(filename);
}

async function collectFiles(
	absolutePath: string,
	pattern: string | undefined,
	signal: AbortSignal | undefined,
	maxFiles: number,
): Promise<string[]> {
	const results: string[] = [];
	await walkDirectory(absolutePath, pattern, signal, maxFiles + 1, results);
	return results;
}

async function walkDirectory(
	directory: string,
	pattern: string | undefined,
	signal: AbortSignal | undefined,
	maxFiles: number,
	results: string[],
): Promise<void> {
	if (signal?.aborted || results.length >= maxFiles) return;

	let entries: string[];
	try {
		entries = await readdir(directory, { encoding: "utf8" });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (signal?.aborted || results.length >= maxFiles) return;
		const fullPath = path.join(directory, entry);
		let info: Awaited<ReturnType<typeof lstat>>;
		try {
			info = await lstat(fullPath);
		} catch {
			continue;
		}

		if (info.isSymbolicLink()) {
			continue;
		}
		if (info.isDirectory()) {
			if (!SKIP_DIRS.has(entry)) {
				await walkDirectory(fullPath, pattern, signal, maxFiles, results);
			}
			continue;
		}
		if (info.isFile() && (pattern === undefined || matchesGlob(entry, pattern))) {
			results.push(fullPath);
		}
	}
}

const defaultGlobOperations: GlobOperations = {
	async listFiles(absolutePath, pattern, { maxFiles, signal }) {
		const info = await lstat(absolutePath);
		if (info.isFile()) {
			const name = path.basename(absolutePath);
			return pattern === undefined || matchesGlob(name, pattern) ? [absolutePath] : [];
		}
		if (!info.isDirectory()) return [];
		return collectFiles(absolutePath, pattern, signal, maxFiles);
	},
};

function formatGlobCall(
	args: { path?: string; pattern?: string; maxFiles?: number } | undefined,
	theme: Theme,
): string {
	const pattern = str(args?.pattern);
	const rawPath = str(args?.path);
	const pathDisplay = rawPath !== null ? shortenPath(rawPath || ".") : null;
	const invalidArg = invalidArgText(theme);
	let text =
		theme.fg("toolTitle", theme.bold("glob")) +
		" " +
		(pattern === null ? invalidArg : theme.fg("accent", pattern || "**/*")) +
		theme.fg("toolOutput", ` in ${pathDisplay === null ? invalidArg : pathDisplay}`);
	if (args?.maxFiles !== undefined) {
		text += theme.fg("toolOutput", ` (max ${args.maxFiles})`);
	}
	return text;
}

function formatGlobResult(
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: GlobToolDetails;
	},
	options: ToolRenderResultOptions,
	theme: Theme,
): string {
	const output = getTextOutput(result).trim();
	let text = "";
	if (output) {
		const lines = output.split("\n");
		const maxLines = options.expanded ? lines.length : 20;
		const displayLines = lines.slice(0, maxLines);
		const remaining = lines.length - maxLines;
		text += `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
		if (remaining > 0) {
			text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;
		}
	}

	const resultLimit = result.details?.resultLimitReached;
	if (resultLimit) {
		text += `\n${theme.fg("warning", `[Truncated: ${resultLimit} results limit]`)}`;
	}
	return text;
}

export function createGlobSpec(
	cwd: string,
	options?: GlobToolOptions,
): PiToolSpec<typeof globSchema, GlobToolDetails | undefined> {
	const ops = options?.operations ?? defaultGlobOperations;
	return {
		name: "glob",
		label: "glob",
		description:
			"List file paths under a directory that match an optional filename glob. Does not read file contents. Skips common bulky directories (node_modules, .git, dist, build). Paths are returned relative to the current working directory. Results are capped by maxFiles.",
		promptSnippet: "List file paths by filename glob without reading contents",
		parameters: globSchema,
		async execute(
			toolCallId,
			{ path: inputPath, pattern, maxFiles }: { path?: string; pattern?: string; maxFiles?: number },
			signal?: AbortSignal,
			_onUpdate?,
		) {
			if (signal?.aborted) throw new Error("Operation aborted");
			const startedAt = Date.now();
			const searchPath = resolveToCwd(inputPath || ".", cwd);
			const effectiveMaxFiles = maxFiles ?? DEFAULT_MAX_FILES;
			if (effectiveMaxFiles <= 0 || !Number.isFinite(effectiveMaxFiles)) {
				throw new Error("maxFiles must be a positive number");
			}

			let files: string[];
			try {
				files = await ops.listFiles(searchPath, pattern, { maxFiles: effectiveMaxFiles + 1, signal });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Cannot access path "${searchPath}": ${message}`);
			}
			if (signal?.aborted) throw new Error("Operation aborted");

			const resultLimitReached = files.length > effectiveMaxFiles;
			const cappedFiles = files.slice(0, effectiveMaxFiles);
			const outputLines = cappedFiles
				.map((file) => (path.isAbsolute(file) ? path.relative(cwd, file) || file : file))
				.map(toPosixPath)
				.sort((a, b) => a.localeCompare(b));
			let output = outputLines.length > 0 ? outputLines.join("\n") : "No files matched.";
			const details: GlobToolDetails = {};
			if (resultLimitReached) {
				details.resultLimitReached = effectiveMaxFiles;
				output += `\n\n[listing capped at ${effectiveMaxFiles} paths; raise maxFiles for more]`;
			}

			const endedAt = Date.now();
			const location: Record<string, string | number | boolean> = pattern
				? { cwd, path: searchPath, pattern, results: outputLines.length }
				: { cwd, path: searchPath, results: outputLines.length };
			const receipt = createToolReceipt({
				toolCallId,
				toolName: "glob",
				status: "completed",
				actionSummary: `Listed files${pattern ? ` for ${pattern}` : ""}`,
				location,
				inspect: [{ label: "path", kind: "path", value: searchPath }],
				startedAt: new Date(startedAt).toISOString(),
				endedAt: new Date(endedAt).toISOString(),
				durationMs: endedAt - startedAt,
				outputPreview: output.slice(0, 240),
			});
			return {
				content: [{ type: "text", text: output }],
				details: attachToolReceipt(Object.keys(details).length > 0 ? details : undefined, receipt),
			};
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatGlobCall(args, theme));
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatGlobResult(result as any, options, theme));
			return text;
		},
	};
}

export function createGlobTool(cwd: string, options?: GlobToolOptions): Tool<typeof globSchema> {
	return toTool(createGlobSpec(cwd, options));
}
