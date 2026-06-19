import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRegistry } from "../src/core/model-registry.ts";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { SubagentManager, type SubagentRecord } from "../src/core/subagents.ts";

async function writeRecord(cwd: string, record: SubagentRecord): Promise<void> {
	const path = join(cwd, ".pi", "workflows", "subagents", record.id, "record.json");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

describe("SubagentManager", () => {
	let cwd: string;
	let manager: SubagentManager;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-subagents-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const agentDir = join(cwd, "agent");
		const settingsManager = SettingsManager.create(cwd, agentDir);
		const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
		const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
		const resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
		await resourceLoader.reload();
		manager = new SubagentManager({
			cwd,
			agentDir,
			authStorage,
			settingsManager,
			modelRegistry,
			resourceLoader,
			diagnostics: [],
		});
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("reads and lists durable records", async () => {
		const record: SubagentRecord = {
			id: "subagent-a",
			role: "planner",
			status: "completed",
			cwd,
			resumable: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:01.000Z",
			result_text: "done",
		};
		await writeRecord(cwd, record);

		expect(await manager.read("subagent-a")).toMatchObject({ role: "planner", result_text: "done" });
		expect((await manager.list()).map((item) => item.id)).toEqual(["subagent-a"]);
	});

	it("classifies missing and context-unavailable resume", async () => {
		expect(await manager.resume("missing", "continue")).toEqual({ ok: false, reason: "not_found" });
		await writeRecord(cwd, {
			id: "subagent-b",
			role: "planner",
			status: "completed",
			cwd,
			resumable: false,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:01.000Z",
		});

		const result = await manager.resume("subagent-b", "continue");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("context_unavailable");
	});

	it("returns terminal records from await", async () => {
		await writeRecord(cwd, {
			id: "subagent-c",
			role: "critic",
			status: "failed",
			cwd,
			resumable: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:01.000Z",
			error_text: "failed",
		});

		const result = await manager.await("subagent-c");
		expect(result?.record.status).toBe("failed");
	});

	it("appends an audit index line on record writes", async () => {
		await manager.cancel("subagent-index"); // no-op on missing
		await writeRecord(cwd, {
			id: "subagent-index",
			role: "planner",
			status: "running",
			cwd,
			resumable: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
		});
		await manager.cancel("subagent-index");
		const index = await readFile(join(cwd, ".pi", "workflows", "subagents", "index.jsonl"), "utf8");
		const lines = index.trim().split("\n");
		expect(lines.length).toBeGreaterThanOrEqual(1);
		const last = JSON.parse(lines[lines.length - 1] ?? "") as Record<string, unknown>;
		expect(last).toMatchObject({ id: "subagent-index", status: "cancelled" });
	});

	it("waitFor reports not_found and terminal records", async () => {
		const missing = await manager.waitFor("missing");
		expect(missing.ok).toBe(false);
		if (!missing.ok) expect(missing.reason).toBe("not_found");

		await writeRecord(cwd, {
			id: "subagent-term",
			role: "planner",
			status: "completed",
			cwd,
			resumable: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:01.000Z",
			result_text: "ok",
		});
		const terminal = await manager.waitFor("subagent-term");
		expect(terminal.ok).toBe(true);
		if (terminal.ok) expect(terminal.result.output).toBe("ok");
	});

	it("pause rejects non-running subagents and steer falls back to resume", async () => {
		const pause = await manager.pause("subagent-idle");
		expect(pause.ok).toBe(false);
		if (!pause.ok) expect(pause.reason).toBe("not_running");

		await writeRecord(cwd, {
			id: "subagent-steer",
			role: "planner",
			status: "completed",
			cwd,
			resumable: false,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:01.000Z",
		});
		const steer = await manager.steer("subagent-steer", "redirect");
		expect(steer.ok).toBe(false);
		if (!steer.ok) expect(steer.reason).toBe("context_unavailable");
	});
});
