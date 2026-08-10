import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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

	it("writes private files atomically", () => {
		const storage = new FileStorage(cwd, agentDir);
		storage.update("global", () => "{}\n");
		const path = join(agentDir, "settings.json");
		expect(storage.read("global")).toBe("{}\n");
		if (process.platform !== "win32") {
			expect(statSync(agentDir).mode & 0o777).toBe(0o700);
			expect(statSync(path).mode & 0o777).toBe(0o600);
		}
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

	it("rejects insecure files", () => {
		if (process.platform === "win32") return;
		mkdirSync(agentDir, { recursive: true });
		const path = join(agentDir, "settings.json");
		writeFileSync(path, "{}\n", { encoding: "utf8", mode: 0o600 });
		chmodSync(path, 0o644);
		const storage = new FileStorage(cwd, agentDir);
		expect(() => storage.read("global")).toThrow("permissions must be 0600");
	});
});
