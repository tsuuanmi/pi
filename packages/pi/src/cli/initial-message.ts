import type { Args } from "#pi/cli/args";
export interface InitialMessageInput {
	parsed: Args;
	fileText?: string;
	stdinContent?: string;
}
export interface InitialMessageResult {
	initialMessage?: string;
}
/**
 * Combine stdin content, @file text, and the first CLI message into a single
 * initial prompt for non-interactive mode.
 */
export function buildInitialMessage({ parsed, fileText, stdinContent }: InitialMessageInput): InitialMessageResult {
	const parts: string[] = [];
	if (stdinContent !== undefined) {
		parts.push(stdinContent);
	}
	if (fileText) {
		parts.push(fileText);
	}
	if (parsed.messages.length > 0) {
		parts.push(parsed.messages[0]);
		parsed.messages.shift();
	}
	return {
		initialMessage: parts.length > 0 ? parts.join("") : undefined,
	};
}
