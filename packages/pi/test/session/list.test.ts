import { chmodSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findMostRecentSession, list, listPage } from "#pi/session/list";
import { createSessionFile } from "#pi/session/store";
import { SESSION_VERSION, type SessionHeader } from "#pi/session/types";

const timestamp = "2026-01-01T00:00:00.000Z";

function header(id: string, cwd: string): SessionHeader {
	return { type: "session", version: SESSION_VERSION, id, timestamp, cwd };
}

describe("session listing", () => {
	let dir: string;

	beforeEach(() => {
		dir = join(tmpdir(), `pi-session-list-${process.pid}-${Date.now()}`);
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("finds the newest valid session", () => {
		const cwd = resolve(dir);
		const first = join(dir, "first.jsonl");
		const second = join(dir, "second.jsonl");
		createSessionFile(first, [header("first", cwd)]);
		createSessionFile(second, [header("second", cwd)]);
		utimesSync(first, new Date(1), new Date(1));
		utimesSync(second, new Date(2), new Date(2));
		expect(findMostRecentSession(dir, cwd)).toBe(second);
	});

	it("fails instead of skipping an invalid session", () => {
		const path = join(dir, "invalid.jsonl");
		writeFileSync(path, "not-json\n", { encoding: "utf8", mode: 0o600 });
		if (process.platform !== "win32") chmodSync(path, 0o600);
		expect(() => findMostRecentSession(dir, resolve(dir))).toThrow();
	});

	it("filters a shared directory by working directory", async () => {
		const firstCwd = resolve(dir, "first-project");
		const secondCwd = resolve(dir, "second-project");
		createSessionFile(join(dir, "first.jsonl"), [header("first", firstCwd)]);
		createSessionFile(join(dir, "second.jsonl"), [header("second", secondCwd)]);
		const sessions = await list(firstCwd, dir);
		expect(sessions.map((session) => session.id)).toEqual(["first"]);
	});

	it("paginates without coercing invalid bounds", async () => {
		await expect(listPage(resolve(dir), dir, undefined, -1, 1)).rejects.toThrow("offset");
		await expect(listPage(resolve(dir), dir, undefined, 0, 0)).rejects.toThrow("limit");
	});
});
