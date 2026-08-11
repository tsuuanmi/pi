import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStorage } from "#pi/settings/storage";

describe("settings storage", () => {
	let root: string;
	let cwd: string;
	let agentDir: string;

	beforeEach(() => {
		root = join(tmpdir(), `pi-settings-storage-${process.pid}-${Date.now()}`);
		cwd = join(root, "project");
		agentDir = join(root, "agent");
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("does not create project configuration while reading a missing file", () => {
		const storage = new FileStorage(cwd, agentDir);
		expect(storage.read("project")).toBeUndefined();
		expect(existsSync(join(cwd, ".pi"))).toBe(false);
	});

	it("writes files atomically", () => {
		const storage = new FileStorage(cwd, agentDir);
		storage.update("global", () => "{}\n");
		expect(storage.read("global")).toBe("{}\n");
		expect(readdirSync(agentDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("reads the latest value while holding the write lock", () => {
		const storage = new FileStorage(cwd, agentDir);
		storage.update("global", () => '{"theme":"dark"}\n');
		storage.update("global", (current) => {
			expect(current).toBe('{"theme":"dark"}\n');
			return '{"theme":"light"}\n';
		});
		expect(storage.read("global")).toBe('{"theme":"light"}\n');
	});

	it("reads files regardless of POSIX permission mode", () => {
		if (process.platform === "win32") return;
		mkdirSync(agentDir, { recursive: true });
		const path = join(agentDir, "settings.json");
		writeFileSync(path, "{}\n", { encoding: "utf8" });
		chmodSync(path, 0o644);
		const storage = new FileStorage(cwd, agentDir);
		expect(storage.read("global")).toBe("{}\n");
	});
});
