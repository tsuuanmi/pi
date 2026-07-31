import type { Args } from "#pi/cli/args";
import { processFileArguments } from "#pi/cli/file-processor";
import { buildInitialMessage } from "#pi/cli/initial-message";
import { takeOverStdout } from "#pi/modes/output-guard";
import type { AppMode } from "#pi/app/modes";

export interface PreparedInput {
	appMode: AppMode;
	initialMessage?: string;
}

function resolveAppMode(parsed: Args, stdinIsTTY: boolean, stdoutIsTTY: boolean): AppMode {
	if (parsed.mode === "rpc") return "rpc";
	if (parsed.mode === "json") return "json";
	if (parsed.print || !stdinIsTTY || !stdoutIsTTY) return "print";
	return "interactive";
}

function isPlainRuntimeMetadataCommand(parsed: Args): boolean {
	return !parsed.print && parsed.mode === undefined && (parsed.help === true || parsed.listModels !== undefined);
}

async function readPipedStdin(): Promise<string | undefined> {
	if (process.stdin.isTTY) return undefined;

	return new Promise((resolve) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.on("end", () => {
			resolve(data.trim() || undefined);
		});
		process.stdin.resume();
	});
}

async function buildStartupMessage(parsed: Args, stdinContent?: string): Promise<string | undefined> {
	if (parsed.fileArgs.length === 0) {
		return buildInitialMessage({ parsed, stdinContent }).initialMessage;
	}

	const { text } = await processFileArguments(parsed.fileArgs);
	return buildInitialMessage({ parsed, fileText: text, stdinContent }).initialMessage;
}

export function resolveStartupMode(parsed: Args): AppMode {
	return resolveAppMode(parsed, process.stdin.isTTY, process.stdout.isTTY);
}

export function applyStdoutMode(appMode: AppMode, parsed: Args): void {
	if (appMode !== "interactive" && !isPlainRuntimeMetadataCommand(parsed)) {
		takeOverStdout();
	}
}

export async function prepareInput(parsed: Args, appMode: AppMode): Promise<PreparedInput> {
	let mode = appMode;
	let stdinContent: string | undefined;
	if (mode !== "rpc") {
		stdinContent = await readPipedStdin();
		if (stdinContent !== undefined && mode === "interactive") {
			mode = "print";
		}
	}

	return {
		appMode: mode,
		initialMessage: await buildStartupMessage(parsed, stdinContent),
	};
}
