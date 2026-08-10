import chalk from "chalk";

/**
 * Errors thrown by the settings, auth, and session codecs when a user-editable
 * file violates its schema. Their `message` already includes the offending path,
 * so they are surfaced as clean, actionable CLI errors rather than stack traces.
 */

const FORMAT_ERROR_SUFFIX = "FormatError";

/** True when `error` is a user-fixable config/data format error from a codec. */
export function isFormatError(error: unknown): error is Error {
	return error instanceof Error && error.name.endsWith(FORMAT_ERROR_SUFFIX);
}

/** Print a format error to stderr in the standard CLI error style. */
export function reportFormatError(error: Error): void {
	console.error(chalk.red(`Error: ${error.message}`));
}
