import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager } from "#pi/session/manager";
import { appendSessionEntries, createSessionFile, readSessionFile, readSessionHeader } from "#pi/session/store";
import { SESSION_VERSION, type SessionEntry, type SessionHeader } from "#pi/session/types";

const timestamp = "2026-01-01T00:00:00.000Z";

function header(id: string, cwd: string): SessionHeader {
	return { type: "session", version: SESSION_VERSION, id, timestamp, cwd };
}

function writePrivate(path: string, content: string): void {
	writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
	if (process.platform !== "win32") chmodSync(path, 0o600);
}

describe("session store", () => {
	let dir: string;

	beforeEach(() => {
		dir = join(tmpdir(), `pi-session-store-${process.pid}-${Date.now()}`);
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("creates private files and appends valid entries", () => {
		const path = join(dir, "session.jsonl");
		const first: SessionEntry = {
			type: "custom",
			id: "00000001",
			parentId: null,
			timestamp,
			customType: "first",
		};
		const second: SessionEntry = {
			type: "custom",
			id: "00000002",
			parentId: first.id,
			timestamp,
			customType: "second",
		};

		createSessionFile(path, [header("session-1", resolve(dir)), first]);
		appendSessionEntries(path, [second]);

		expect(readSessionFile(path)).toHaveLength(3);
		if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	it("rejects missing, empty, malformed, and unsupported files without changing them", () => {
		const missing = join(dir, "missing.jsonl");
		expect(() => readSessionFile(missing)).toThrow();

		for (const [name, content] of [
			["empty.jsonl", ""],
			["malformed.jsonl", "not-json\n"],
		] as const) {
			const path = join(dir, name);
			writePrivate(path, content);
			expect(() => SessionManager.open(path, dir)).toThrow();
			expect(readFileSync(path, "utf8")).toBe(content);
		}

		// Legacy version 3 sessions are accepted on read without being rewritten.
		const legacyPath = join(dir, "old.jsonl");
		const legacyContent = `${JSON.stringify({ ...header("old", resolve(dir)), version: 3 })}\n`;
		writePrivate(legacyPath, legacyContent);
		expect(() => SessionManager.open(legacyPath, dir)).not.toThrow();
		expect(readFileSync(legacyPath, "utf8")).toBe(legacyContent);
	});

	it("rejects files readable by other users", () => {
		if (process.platform === "win32") return;
		const path = join(dir, "insecure.jsonl");
		writePrivate(path, `${JSON.stringify(header("insecure", resolve(dir)))}\n`);
		chmodSync(path, 0o644);
		expect(() => readSessionHeader(path)).toThrow("permissions must be 0600");
	});

	it("reads headers larger than 512 bytes", () => {
		const path = join(dir, "long-header.jsonl");
		const value = header("long-header", resolve(dir, "x".repeat(1024)));
		writePrivate(path, `${JSON.stringify(value)}\n`);
		expect(readSessionHeader(path)).toEqual(value);
	});

	it("does not create a session when openRecent finds none", () => {
		expect(() => SessionManager.openRecent(resolve(dir), dir)).toThrow("No session found");
		expect(readdirSync(dir)).toEqual([]);
	});
});
