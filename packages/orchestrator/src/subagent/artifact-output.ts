import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { withFileMutationQueue } from "@tsuuanmi/pi-agent/node";
import type { SubagentOutputArtifact, SubagentOutputArtifactRequest } from "#orchestrator/subagent/types";

export async function readTaskPrompt(cwd: string, path: string): Promise<string> {
	const resolvedPath = await resolveWorkspacePath(cwd, path, "task prompt");
	const prompt = await readFile(resolvedPath, "utf8");
	if (prompt.trim().length === 0) throw new Error("task prompt file must be non-empty");
	return prompt;
}

export async function writeOutputArtifact(
	cwd: string,
	request: SubagentOutputArtifactRequest,
	output: string,
): Promise<SubagentOutputArtifact> {
	const path = await resolveWorkspacePath(cwd, request.path, "output artifact");
	await withFileMutationQueue(path, async () => {
		if (request.mode === "replace") await assertExpectedOutput(path, request.expectedSha256);
		else await assertMissingOutput(path);
		await writeTextAtomic(path, output, request.mode);
	});
	return {
		path,
		sha256: hashText(output),
		media_type: request.mediaType,
		mode: request.mode,
	};
}

async function resolveWorkspacePath(cwd: string, path: string, field: string): Promise<string> {
	if (path.trim().length === 0) throw new Error(`${field} path must be non-empty`);
	if (path.trim() !== path) throw new Error(`${field} path must not have surrounding whitespace`);
	const root = resolve(cwd);
	const resolvedPath = resolve(root, path);
	if (!isWithin(root, resolvedPath)) throw new Error(`${field} path must stay within the workspace`);
	await assertNoSymlink(root, resolvedPath, field);
	return resolvedPath;
}

function isWithin(root: string, path: string): boolean {
	const child = relative(root, path);
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

async function assertNoSymlink(root: string, path: string, field: string): Promise<void> {
	let current = root;
	for (const segment of relative(root, path)
		.split(/[\\/]+/)
		.filter(Boolean)) {
		current = resolve(current, segment);
		try {
			if ((await lstat(current)).isSymbolicLink()) throw new Error(`${field} path must not traverse symbolic links`);
		} catch (error) {
			if (isMissingFile(error)) return;
			throw error;
		}
	}
}

async function assertMissingOutput(path: string): Promise<void> {
	try {
		await lstat(path);
		throw new Error(`output artifact already exists: ${path}`);
	} catch (error) {
		if (isMissingFile(error)) return;
		throw error;
	}
}

async function assertExpectedOutput(path: string, expectedSha256: string | undefined): Promise<void> {
	if (!expectedSha256) throw new Error("replace output artifact requires expectedSha256");
	let current: string;
	try {
		current = await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFile(error)) throw new Error(`output artifact does not exist: ${path}`);
		throw error;
	}
	if (hashText(current) !== expectedSha256) throw new Error(`output artifact changed before replacement: ${path}`);
}

async function writeTextAtomic(path: string, content: string, mode: "create" | "replace"): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tempPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
	try {
		await writeFile(tempPath, content, "utf8");
		if (mode === "create") {
			await link(tempPath, path);
			await unlink(tempPath);
		} else {
			await rename(tempPath, path);
		}
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		if (isFileExists(error)) throw new Error(`output artifact already exists: ${path}`);
		throw error;
	}
}

function hashText(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function isMissingFile(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isFileExists(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
