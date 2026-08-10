import { existsSync, readdirSync, statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AgentMessage } from "@tsuuanmi/pi-agent";
import { normalizePath, resolvePath } from "@tsuuanmi/pi-agent/node";
import { getAgentDir as getDefaultAgentDir, getSessionsDir } from "#pi/loader/paths";
import { ensureSessionDir, readSessionFile, readSessionHeader } from "#pi/session/store";
import {
	SESSION_PAGE_SIZE,
	type SessionInfo,
	type SessionListPage,
	type SessionListProgress,
	type SessionMessageEntry,
} from "#pi/session/types";

export function getDefaultSessionDirPath(cwd: string, agentDir: string = getDefaultAgentDir()): string {
	const resolvedCwd = resolvePath(cwd);
	const resolvedAgentDir = resolvePath(agentDir);
	const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
	return join(resolvedAgentDir, "sessions", safePath);
}

export function getDefaultSessionDir(cwd: string, agentDir: string = getDefaultAgentDir()): string {
	const path = getDefaultSessionDirPath(cwd, agentDir);
	ensureSessionDir(path);
	return path;
}

function matchesCwd(sessionCwd: string, cwd: string): boolean {
	return resolvePath(sessionCwd) === resolvePath(cwd);
}

export function findMostRecentSession(sessionDir: string, cwd?: string): string | null {
	const path = normalizePath(sessionDir);
	if (!existsSync(path)) return null;
	const files = readdirSync(path)
		.filter((file) => file.endsWith(".jsonl"))
		.map((file) => join(path, file))
		.filter((file) => cwd === undefined || matchesCwd(readSessionHeader(file).cwd, cwd))
		.map((file) => ({ path: file, modified: statSync(file).mtimeMs }))
		.sort((a, b) => b.modified - a.modified);
	return files[0]?.path ?? null;
}

type MessageWithContent = Extract<AgentMessage, { content: unknown }>;

function hasContent(message: AgentMessage): message is MessageWithContent {
	return "content" in message;
}

function textContent(message: MessageWithContent): string {
	if (typeof message.content === "string") return message.content;
	return message.content
		.map((block) => (block.type === "text" ? block.text : ""))
		.filter((text) => text.length > 0)
		.join(" ");
}

function activityTime(entry: SessionMessageEntry): number | undefined {
	return entry.message.role === "user" || entry.message.role === "assistant" ? entry.message.timestamp : undefined;
}

function buildInfo(path: string): SessionInfo {
	const [header, ...entries] = readSessionFile(path);
	if (header.type !== "session") throw new Error(`Session header is missing: ${path}`);

	let messageCount = 0;
	let firstMessage = "";
	let name: string | undefined;
	let modified = Date.parse(header.timestamp);
	const messages: string[] = [];
	for (const entry of entries) {
		if (entry.type === "session") throw new Error(`Unexpected session header: ${path}`);
		if (entry.type === "session_info") name = entry.name?.trim() || undefined;
		if (entry.type !== "message") continue;
		messageCount++;
		const time = activityTime(entry);
		if (time !== undefined) modified = Math.max(modified, time);
		if (!hasContent(entry.message) || (entry.message.role !== "user" && entry.message.role !== "assistant")) continue;
		const text = textContent(entry.message);
		if (!text) continue;
		messages.push(text);
		if (!firstMessage && entry.message.role === "user") firstMessage = text;
	}

	return {
		path,
		id: header.id,
		cwd: header.cwd,
		name,
		created: new Date(header.timestamp),
		modified: new Date(modified),
		messageCount,
		firstMessage,
		allMessagesText: messages.join(" "),
	};
}

async function buildInfos(paths: readonly string[], onLoaded: (loaded: number) => void): Promise<SessionInfo[]> {
	const sessions: SessionInfo[] = [];
	for (const path of paths) {
		sessions.push(buildInfo(path));
		onLoaded(sessions.length);
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	return sessions;
}

async function listDirectory(
	dir: string,
	onProgress?: SessionListProgress,
	offset = 0,
	total = 0,
): Promise<SessionInfo[]> {
	if (!existsSync(dir)) return [];
	const files = (await readdir(dir)).filter((file) => file.endsWith(".jsonl")).map((file) => join(dir, file));
	const sessions = await buildInfos(files, (loaded) => {
		onProgress?.(offset + loaded, total || files.length);
	});
	sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
	return sessions;
}

interface SessionFile {
	path: string;
	modified: number;
}

async function listFiles(dir: string, cwd?: string): Promise<SessionFile[]> {
	if (!existsSync(dir)) return [];
	const files = (await readdir(dir)).filter((file) => file.endsWith(".jsonl")).map((file) => join(dir, file));
	const result: SessionFile[] = [];
	for (const path of files) {
		const header = readSessionHeader(path);
		if (cwd !== undefined && !matchesCwd(header.cwd, cwd)) continue;
		result.push({ path, modified: (await stat(path)).mtimeMs });
	}
	return result.sort((a, b) => b.modified - a.modified);
}

function validatePage(offset: number, limit: number): void {
	if (!Number.isInteger(offset) || offset < 0)
		throw new RangeError("Session page offset must be a non-negative integer.");
	if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Session page limit must be a positive integer.");
}

export async function listPage(
	cwd: string,
	sessionDir: string | undefined,
	onProgress?: SessionListProgress,
	offset = 0,
	limit = SESSION_PAGE_SIZE,
): Promise<SessionListPage> {
	validatePage(offset, limit);
	const customDir = sessionDir !== undefined;
	if (customDir && sessionDir.length === 0) throw new Error("Session directory must not be empty.");
	const dir = customDir ? normalizePath(sessionDir) : getDefaultSessionDirPath(cwd);
	const files = await listFiles(dir, customDir && dir !== getDefaultSessionDirPath(cwd) ? cwd : undefined);
	const page = files.slice(offset, offset + limit);
	const sessions = await buildInfos(
		page.map((file) => file.path),
		(loaded) => onProgress?.(loaded, page.length),
	);
	return { sessions, hasMore: offset + page.length < files.length, nextOffset: offset + page.length };
}

export async function listAllPage(
	sessionDir: string | undefined,
	onProgress?: SessionListProgress,
	offset = 0,
	limit = SESSION_PAGE_SIZE,
): Promise<SessionListPage> {
	validatePage(offset, limit);
	const root = getSessionsDir();
	if (!sessionDir && !existsSync(root)) return { sessions: [], hasMore: false, nextOffset: offset };
	const files = sessionDir
		? await listFiles(normalizePath(sessionDir))
		: (
				await Promise.all(
					(
						await readdir(root, { withFileTypes: true })
					)
						.filter((entry) => entry.isDirectory())
						.map((entry) => listFiles(join(root, entry.name))),
				)
			).flat();
	const ordered = files.sort((a, b) => b.modified - a.modified);
	const page = ordered.slice(offset, offset + limit);
	const sessions = await buildInfos(
		page.map((file) => file.path),
		(loaded) => onProgress?.(loaded, page.length),
	);
	return { sessions, hasMore: offset + page.length < ordered.length, nextOffset: offset + page.length };
}

export async function list(cwd: string, sessionDir?: string, onProgress?: SessionListProgress): Promise<SessionInfo[]> {
	const customDir = sessionDir !== undefined;
	if (customDir && sessionDir.length === 0) throw new Error("Session directory must not be empty.");
	const dir = customDir ? normalizePath(sessionDir) : getDefaultSessionDirPath(cwd);
	if (!customDir || dir === getDefaultSessionDirPath(cwd)) return listDirectory(dir, onProgress);
	const files = await listFiles(dir, cwd);
	let loaded = 0;
	const sessions = await buildInfos(
		files.map((file) => file.path),
		() => {
			loaded++;
			onProgress?.(loaded, files.length);
		},
	);
	sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
	return sessions;
}

export async function listAll(
	sessionDirOrProgress?: string | SessionListProgress,
	onProgress?: SessionListProgress,
): Promise<SessionInfo[]> {
	if (typeof sessionDirOrProgress === "string") return listDirectory(normalizePath(sessionDirOrProgress), onProgress);
	const progress = sessionDirOrProgress ?? onProgress;
	const root = getSessionsDir();
	if (!existsSync(root)) return [];
	const directories = (await readdir(root, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(root, entry.name));
	const files = (await Promise.all(directories.map((dir) => listFiles(dir)))).flat();
	const sessions = await buildInfos(
		files.sort((a, b) => b.modified - a.modified).map((file) => file.path),
		(loaded) => progress?.(loaded, files.length),
	);
	sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
	return sessions;
}
