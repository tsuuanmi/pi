const HEAD_BYTES = 4_096;
const MAX_PATH_BYTES = 512;

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

function prefix(value: string, maxBytes: number): string {
	let bytes = 0;
	let result = "";
	for (const char of value) {
		const nextBytes = byteLength(char);
		if (bytes + nextBytes > maxBytes) break;
		result += char;
		bytes += nextBytes;
	}
	return result;
}

function suffix(value: string, maxBytes: number): string {
	let bytes = 0;
	let result = "";
	const chars = Array.from(value);
	for (let index = chars.length - 1; index >= 0; index--) {
		const char = chars[index];
		const nextBytes = byteLength(char);
		if (bytes + nextBytes > maxBytes) break;
		result = char + result;
		bytes += nextBytes;
	}
	return result;
}

function truncatePath(path: string): string {
	if (byteLength(path) <= MAX_PATH_BYTES) return path;
	const separator = "…";
	const sideBudget = Math.max(0, Math.floor((MAX_PATH_BYTES - byteLength(separator)) / 2));
	return `${prefix(path, sideBudget)}${separator}${suffix(path, sideBudget)}`;
}

function countLines(value: string): number {
	if (!value) return 0;
	return value.split(/\r?\n/).length;
}

export function compressBashOutput(output: string, options: { maxBytes: number; fullOutputPath?: string }): string {
	const maxBytes = Math.max(1, Math.floor(options.maxBytes));
	if (byteLength(output) <= maxBytes) return output;

	const fullOutputPath = options.fullOutputPath ? truncatePath(options.fullOutputPath) : "unavailable";
	let marker = `[Pi retained-context compression: omitted 0 bytes / 0 lines from bash output. Full output: ${fullOutputPath}.]`;
	if (byteLength(marker) > maxBytes) {
		marker = "[Pi retained-context compression: output omitted. Full output: unavailable.]";
	}
	if (byteLength(marker) > maxBytes) {
		return prefix(marker, maxBytes);
	}

	const headBudget = Math.min(HEAD_BYTES, Math.max(0, maxBytes - byteLength(marker)));
	const initialHead = prefix(output, headBudget);
	const tailBudget = Math.max(0, maxBytes - byteLength(initialHead) - byteLength(marker));
	const initialTail = suffix(output, tailBudget);
	const omittedStart = initialHead.length;
	const omittedEnd = output.length - initialTail.length;
	const omitted = omittedEnd > omittedStart ? output.slice(omittedStart, omittedEnd) : "";
	const omittedBytes = Math.max(0, byteLength(omitted));
	const omittedLines = countLines(omitted);
	marker = `[Pi retained-context compression: omitted ${omittedBytes} bytes / ${omittedLines} lines from bash output. Full output: ${fullOutputPath}.]`;

	let head = initialHead;
	let tail = initialTail;
	let remaining = maxBytes - byteLength(marker);
	if (remaining < 0) {
		return prefix(marker, maxBytes);
	}
	if (byteLength(head) > remaining) {
		head = prefix(head, remaining);
		tail = "";
	} else {
		remaining -= byteLength(head);
		tail = suffix(tail, remaining);
	}

	return `${head}${marker}${tail}`;
}
