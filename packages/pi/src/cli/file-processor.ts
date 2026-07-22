/**
 * Process @file CLI arguments into text content
 */

import { access, readFile, stat } from "node:fs/promises";
import chalk from "chalk";
import { resolve } from "path";
import { resolveReadPath } from "#pi/tools/path-utils";

export interface ProcessedFiles {
	text: string;
}

export interface ProcessFileOptions {
	/** Custom operations for file reading */
}

/** Process @file arguments into text content */
export async function processFileArguments(fileArgs: string[], _options?: ProcessFileOptions): Promise<ProcessedFiles> {
	let text = "";

	for (const fileArg of fileArgs) {
		// Expand and resolve path (handles ~ expansion and macOS screenshot Unicode spaces)
		const absolutePath = resolve(resolveReadPath(fileArg, process.cwd()));

		// Check if file exists
		try {
			await access(absolutePath);
		} catch {
			console.error(chalk.red(`Error: File not found: ${absolutePath}`));
			process.exit(1);
		}

		// Check if file is empty
		const stats = await stat(absolutePath);
		if (stats.size === 0) {
			// Skip empty files
			continue;
		}

		// Read text file content
		try {
			const content = await readFile(absolutePath, "utf-8");
			text += `<file name="${absolutePath}">\n${content}\n</file>\n`;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(chalk.red(`Error: Could not read file ${absolutePath}: ${message}`));
			process.exit(1);
		}
	}

	return { text };
}
