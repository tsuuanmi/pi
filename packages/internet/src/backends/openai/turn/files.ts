import { readFile, realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { InternetError } from "#internet/core/errors";

const FILE_REFERENCE_PATTERN = /(?:^|\s)@([A-Za-z0-9._/-]+)/g;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024;
const GENERATED_MARKER = "<local_file_references_json>";

export async function expandLocalFileReferences(payload: unknown, cwd: string): Promise<unknown> {
	if (!isRecord(payload) || !Array.isArray(payload.input)) return payload;
	const input = payload.input.slice();
	const userIndex = findActiveUserIndex(input);
	if (userIndex < 0 || !isRecord(input[userIndex])) return payload;
	const user = input[userIndex];
	if (!Array.isArray(user.content)) return payload;

	const textParts = user.content.filter(isInputText);
	if (textParts.some((part) => part.text.includes(GENERATED_MARKER))) return payload;
	const references = unique(textParts.flatMap((part) => referencedPaths(part.text)));
	if (references.length === 0) return payload;
	if (references.length > MAX_FILES)
		throw invalidFileReference(`at most ${MAX_FILES} files may be referenced per turn`);

	let totalBytes = 0;
	const files: Array<{ path: string; content: string }> = [];
	for (const reference of references) {
		const path = await resolveReference(cwd, reference);
		const metadata = await stat(path).catch(() => undefined);
		if (!metadata) {
			if (reference.includes("/") || reference.includes(".")) {
				throw invalidFileReference(`@${reference} is not a readable regular file`);
			}
			continue;
		}
		if (!metadata.isFile()) throw invalidFileReference(`@${reference} is not a readable regular file`);
		if (metadata.size > MAX_FILE_BYTES) throw invalidFileReference(`@${reference} exceeds ${MAX_FILE_BYTES} bytes`);
		totalBytes += metadata.size;
		if (totalBytes > MAX_TOTAL_BYTES)
			throw invalidFileReference(`referenced files exceed ${MAX_TOTAL_BYTES} total bytes`);
		const bytes = await readFile(path);
		if (bytes.includes(0)) throw invalidFileReference(`@${reference} is not a text file`);
		const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		files.push({ path: reference, content: text });
	}

	if (files.length === 0) return payload;
	const content = user.content.slice();
	content.push({
		type: "input_text",
		text: `${GENERATED_MARKER}\n${JSON.stringify({ files })}\n</local_file_references_json>`,
	});
	input[userIndex] = { ...user, content };
	return { ...payload, input };
}

async function resolveReference(cwd: string, reference: string): Promise<string> {
	const segments = reference.split("/");
	if (segments.some((segment) => !segment || segment === ".." || segment.startsWith("."))) {
		throw invalidFileReference(`@${reference} must be a non-hidden path inside the workspace`);
	}
	const root = await realpath(resolve(cwd));
	const path = await realpath(resolve(root, reference)).catch(() => resolve(root, reference));
	const local = relative(root, path);
	if (!local || local === ".." || local.startsWith(`..${sep}`)) {
		throw invalidFileReference(`@${reference} must be inside the workspace`);
	}
	return path;
}

function referencedPaths(text: string): string[] {
	return [...text.matchAll(FILE_REFERENCE_PATTERN)]
		.map((match) => match[1])
		.filter((value): value is string => !!value);
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function findActiveUserIndex(input: unknown[]): number {
	for (let index = input.length - 1; index >= 0; index -= 1) {
		const item = input[index];
		if (isRecord(item) && item.role === "user") return index;
	}
	return -1;
}

function isInputText(value: unknown): value is { type: "input_text"; text: string } {
	return isRecord(value) && value.type === "input_text" && typeof value.text === "string";
}

function invalidFileReference(detail: string): InternetError {
	return new InternetError(`Invalid local file reference: ${detail}.`, { code: "daemon_rejected" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
