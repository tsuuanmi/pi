import {
	chmodSync,
	closeSync,
	existsSync,
	fchmodSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { decodeHeader, decodeSession, SessionFormatError } from "#pi/session/codec";
import type { FileEntry, SessionEntry, SessionHeader } from "#pi/session/types";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const HEADER_CHUNK_SIZE = 4096;
const MAX_HEADER_BYTES = 64 * 1024;

function assertRegularFile(path: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new Error(`Session path is not a regular file: ${path}`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
		throw new Error(`Session file permissions must be 0600: ${path}`);
	}
}

function line(entry: FileEntry): string {
	return `${JSON.stringify(entry)}\n`;
}

export function ensureSessionDir(path: string): void {
	mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE });
	if (process.platform !== "win32") chmodSync(path, DIRECTORY_MODE);
}

export function readSessionFile(path: string): FileEntry[] {
	assertRegularFile(path);
	return decodeSession(readFileSync(path, "utf8"), path);
}

export function readSessionHeader(path: string): SessionHeader {
	assertRegularFile(path);
	const fd = openSync(path, "r");
	try {
		const chunks: Buffer[] = [];
		let size = 0;
		while (size < MAX_HEADER_BYTES) {
			const buffer = Buffer.allocUnsafe(Math.min(HEADER_CHUNK_SIZE, MAX_HEADER_BYTES - size));
			const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;
			const chunk = buffer.subarray(0, bytesRead);
			const newline = chunk.indexOf(0x0a);
			if (newline !== -1) {
				chunks.push(chunk.subarray(0, newline));
				const text = Buffer.concat(chunks).toString("utf8");
				let value: unknown;
				try {
					value = JSON.parse(text) as unknown;
				} catch {
					throw new SessionFormatError(path, "line is not valid JSON", 1);
				}
				return decodeHeader(value, path, 1);
			}
			chunks.push(chunk);
			size += bytesRead;
		}
		if (size >= MAX_HEADER_BYTES) throw new SessionFormatError(path, `header exceeds ${MAX_HEADER_BYTES} bytes`, 1);
		const text = Buffer.concat(chunks).toString("utf8");
		if (text.length === 0) throw new SessionFormatError(path, "session is empty");
		let value: unknown;
		try {
			value = JSON.parse(text) as unknown;
		} catch {
			throw new SessionFormatError(path, "line is not valid JSON", 1);
		}
		return decodeHeader(value, path, 1);
	} finally {
		closeSync(fd);
	}
}

export function createSessionFile(path: string, entries: readonly FileEntry[]): void {
	if (entries.length === 0 || entries[0].type !== "session") {
		throw new Error("Cannot create a session file without a header.");
	}
	if (existsSync(path)) throw new Error(`Session file already exists: ${path}`);
	ensureSessionDir(dirname(path));
	const fd = openSync(path, "wx", FILE_MODE);
	try {
		if (process.platform !== "win32") fchmodSync(fd, FILE_MODE);
		for (const entry of entries) writeFileSync(fd, line(entry));
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

export function appendSessionEntries(path: string, entries: readonly SessionEntry[]): void {
	if (entries.length === 0) return;
	assertRegularFile(path);
	const fd = openSync(path, "a");
	try {
		for (const entry of entries) writeFileSync(fd, line(entry));
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}
