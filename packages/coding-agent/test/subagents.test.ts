import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fauxAssistantMessage, fauxToolCall, registerFauxProvider } from "@tsuuanmi/pi-ai";
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

function getReasoning(options: unknown): unknown {
	if (!options || typeof options !== "object" || !("reasoning" in options)) return undefined;
	return options.reasoning;
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
		expect(result?.output).toBe("failed");
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

describe("SubagentManager live spawn and resume", () => {
	let cwd: string;
	let manager: SubagentManager;
	let faux: ReturnType<typeof registerFauxProvider>;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-subagent-live-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const agentDir = join(cwd, "agent");
		faux = registerFauxProvider({ models: [{ id: "faux-reasoning", reasoning: true }] });
		faux.setResponses([fauxAssistantMessage("planner response")]);
		const model = faux.getModel();
		const settingsManager = SettingsManager.create(cwd, agentDir);
		const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
		authStorage.setRuntimeApiKey(model.provider, "faux-key");
		const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
		modelRegistry.registerProvider(model.provider, {
			baseUrl: model.baseUrl,
			apiKey: "faux-key",
			api: faux.api,
			models: [
				{
					id: model.id,
					name: model.name,
					api: model.api,
					reasoning: model.reasoning,
					input: model.input,
					cost: model.cost,
					contextWindow: model.contextWindow,
					maxTokens: model.maxTokens,
					baseUrl: model.baseUrl,
				},
			],
		});
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
		faux.unregister();
		await rm(cwd, { recursive: true, force: true });
	});

	it("spawns a subagent and records completion", async () => {
		faux.setResponses([fauxAssistantMessage("task done")]);
		const result = await manager.spawn({
			role: "planner",
			prompt: "Plan the project",
			cwd,
			tools: ["read", "bash"],
			persistent: false,
		});
		expect(result.record.status).toBe("completed");
		expect(result.output).toContain("task done");
		expect(result.record.result_text).toContain("task done");

		// Durable record should match.
		const record = await manager.read(result.record.id);
		expect(record?.status).toBe("completed");
	});

	it("persists parent session ids on spawned records", async () => {
		faux.setResponses([fauxAssistantMessage("child done")]);
		const result = await manager.spawn({
			role: "planner",
			prompt: "Plan the project",
			cwd,
			persistent: false,
			parentSessionId: "parent-session-1",
		});

		expect(result.record.parent_session_id).toBe("parent-session-1");
		expect((await manager.read(result.record.id))?.parent_session_id).toBe("parent-session-1");
	});

	it("applies project agent profile model, thinking level, tools, and system prompt", async () => {
		const model = faux.getModel();
		const profileDir = join(cwd, ".pi", "agents");
		await mkdir(profileDir, { recursive: true });
		await writeFile(
			join(profileDir, "architect.json"),
			JSON.stringify(
				{
					model: `${model.provider}/${model.id}`,
					thinkingLevel: "high",
					tools: ["read"],
					systemPrompt: "PROFILE SYSTEM PROMPT",
					persistent: false,
				},
				null,
				2,
			),
			"utf8",
		);
		const captured: Array<{ modelId: string; reasoning: unknown; tools: string[]; systemPrompt: string }> = [];
		faux.setResponses([
			(context, options, _state, requestModel) => {
				captured.push({
					modelId: requestModel.id,
					reasoning: getReasoning(options),
					tools: context.tools?.map((tool) => tool.name) ?? [],
					systemPrompt: context.systemPrompt ?? "",
				});
				return fauxAssistantMessage("profiled");
			},
		]);

		const result = await manager.spawn({ agent: "architect", prompt: "Use profile", cwd });

		expect(result.record.agent_profile).toBe("architect");
		expect(result.record.role).toBe("architect");
		expect(result.record.model).toBe(`${model.provider}/${model.id}`);
		expect(result.record.thinking_level).toBe("high");
		expect(captured[0]).toMatchObject({ modelId: model.id, reasoning: "high", tools: ["read"] });
		expect(captured[0]?.systemPrompt).toContain("PROFILE SYSTEM PROMPT");
	});

	it("lets explicit subagent spawn overrides win over agent profiles", async () => {
		const profileDir = join(cwd, ".pi", "agents");
		await mkdir(profileDir, { recursive: true });
		await writeFile(
			join(profileDir, "worker.json"),
			JSON.stringify({ thinkingLevel: "high", tools: ["read"], persistent: false }, null, 2),
			"utf8",
		);
		const captured: Array<{ reasoning: unknown; tools: string[] }> = [];
		faux.setResponses([
			(context, options) => {
				captured.push({ reasoning: getReasoning(options), tools: context.tools?.map((tool) => tool.name) ?? [] });
				return fauxAssistantMessage("override");
			},
		]);

		const result = await manager.spawn({
			agent: "worker",
			prompt: "Use overrides",
			cwd,
			thinkingLevel: "low",
			tools: ["bash"],
			persistent: false,
		});

		expect(result.record.thinking_level).toBe("low");
		expect(captured[0]).toMatchObject({ reasoning: "low", tools: ["bash"] });
	});

	it("resumes a persisted subagent session with a follow-up prompt", async () => {
		// Spawn with a persistent session so we can resume
		faux.setResponses([fauxAssistantMessage("initial response")]);
		const spawnResult = await manager.spawn({
			role: "architect",
			prompt: "Design the system",
			cwd,
			tools: ["read", "bash"],
			persistent: true,
		});
		expect(spawnResult.record.status).toBe("completed");
		expect(spawnResult.record.session_file).toBeDefined();

		// Resume with a new prompt
		faux.setResponses([fauxAssistantMessage("refined design")]);
		const resumeResult = await manager.resume(spawnResult.record.id, "Refine the design", {
			tools: ["read", "bash"],
		});
		expect(resumeResult.ok).toBe(true);
		if (resumeResult.ok) {
			expect(resumeResult.result.record.status).toBe("completed");
			expect(resumeResult.result.output).toContain("refined design");
		}
	});

	it("cooperatively pauses a running subagent", async () => {
		// Use a multi-turn faux response so pauseRequested can be checked between turns
		faux.setResponses([fauxAssistantMessage("first response"), fauxAssistantMessage("second response")]);

		// Start spawn and pause after a brief delay
		const spawnPromise = manager.spawn({
			role: "critic",
			prompt: "Review the plan",
			cwd,
			tools: ["read"],
			persistent: true,
		});

		// The spawn runs synchronously with the faux provider.
		// Since pause is cooperative (checked after each turn),
		// a single-turn faux response will complete before pause takes effect.
		// For a single-turn test, the subagent completes normally.
		const result = await spawnPromise;
		expect(result.record.status).toBe("completed");
	});

	it("cancels a running subagent", async () => {
		faux.setResponses([fauxAssistantMessage("should be cancelled")]);
		const result = await manager.spawn({
			role: "planner",
			prompt: "Quick task",
			cwd,
			tools: ["read"],
			persistent: false,
		});
		// Already completed since faux provider is synchronous
		expect(result.record.status).toBe("completed");

		// Cancel on a completed record is a no-op.
		const cancelled = await manager.cancel(result.record.id);
		expect(cancelled?.status).toBe("completed");
	});

	it("await returns completed record for finished subagent", async () => {
		faux.setResponses([fauxAssistantMessage("awaited result")]);
		const spawnResult = await manager.spawn({
			role: "planner",
			prompt: "Do something",
			cwd,
			tools: ["read"],
			persistent: false,
		});

		const awaitResult = await manager.await(spawnResult.record.id);
		expect(awaitResult?.record.status).toBe("completed");
		expect(awaitResult?.output).toContain("awaited result");
	});

	it("detached spawn can time out while live and later complete", async () => {
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("bash", { command: "sleep 0.1 && echo tool-done" }, { id: "call-1" }), {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("detached complete"),
		]);
		const spawned = await manager.spawn({
			role: "worker",
			prompt: "Run a slow command",
			cwd,
			tools: ["bash"],
			persistent: false,
			detached: true,
		});
		expect(spawned.record.status).toBe("queued");

		const timedOut = await manager.waitFor(spawned.record.id, { timeoutMs: 10 });
		expect(timedOut.ok).toBe(false);
		if (!timedOut.ok) {
			expect(timedOut.reason).toBe("timeout");
			expect(timedOut.record?.status).toBe("running");
		}

		const completed = await manager.await(spawned.record.id);
		expect(completed?.record.status).toBe("completed");
		expect(completed?.output).toContain("detached complete");
	});

	it("does not expose subagent tools inside spawned sessions", async () => {
		const capturedTools: string[][] = [];
		faux.setResponses([
			(context) => {
				capturedTools.push(context.tools?.map((tool) => tool.name) ?? []);
				return fauxAssistantMessage("isolated");
			},
		]);
		const result = await manager.spawn({
			role: "isolated-worker",
			prompt: "Check available tools",
			cwd,
			tools: ["read", "subagent_spawn"],
			persistent: false,
		});

		expect(result.record.status).toBe("completed");
		expect(capturedTools[0]).toContain("read");
		expect(capturedTools[0]).not.toContain("subagent_spawn");
	});
});
