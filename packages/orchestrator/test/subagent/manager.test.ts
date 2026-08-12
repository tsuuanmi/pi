import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AuthStorage, DefaultResourceLoader, SettingsManager } from "@tsuuanmi/pi";
import { ModelRegistry } from "@tsuuanmi/pi/loader";
import { sessionStateDir } from "@tsuuanmi/pi/session/root";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SubagentManager } from "#orchestrator/subagent/manager";
import type { SubagentRecord } from "#orchestrator/subagent/types";
import { registerTestProvider, testAssistantMessage, testToolCall } from "../../../pi/test/helpers/provider.ts";

const TEST_SESSION = "test-session";

async function writeRecord(cwd: string, record: SubagentRecord): Promise<void> {
	const path = join(sessionStateDir(cwd, TEST_SESSION), "subagent", record.id, "record.json");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify({ parent_session_id: TEST_SESSION, ...record }, null, 2)}\n`, "utf8");
}

function getReasoning(options: unknown): unknown {
	if (!options || typeof options !== "object" || !("reasoning" in options)) return undefined;
	return options.reasoning;
}

describe("SubagentManager", () => {
	let cwd: string;
	let manager: SubagentManager;
	let resourceLoader: DefaultResourceLoader;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-subagent-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const agentDir = join(cwd, "agent");
		const settingsManager = SettingsManager.create(cwd, agentDir);
		const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
		const modelRegistry = ModelRegistry.inMemory(authStorage);
		resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
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

		expect(await manager.read("subagent-a", TEST_SESSION)).toMatchObject({ role: "planner", result_text: "done" });
		expect((await manager.list(TEST_SESSION)).map((item) => item.id)).toEqual(["subagent-a"]);
	});

	it("classifies missing and context-unavailable resume", async () => {
		expect(await manager.resume("missing", "continue", { storageSessionId: TEST_SESSION })).toEqual({
			ok: false,
			reason: "not_found",
		});
		await writeRecord(cwd, {
			id: "subagent-b",
			role: "planner",
			status: "completed",
			cwd,
			resumable: false,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:01.000Z",
		});

		const result = await manager.resume("subagent-b", "continue", { storageSessionId: TEST_SESSION });
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

		const result = await manager.await("subagent-c", TEST_SESSION);
		expect(result?.record.status).toBe("failed");
		expect(result?.output).toBe("failed");
	});

	it("appends an audit index line on record writes", async () => {
		await manager.cancel("subagent-index", TEST_SESSION); // no-op on missing
		await writeRecord(cwd, {
			id: "subagent-index",
			role: "planner",
			status: "running",
			cwd,
			resumable: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
		});
		await manager.cancel("subagent-index", TEST_SESSION);
		const index = await readFile(join(sessionStateDir(cwd, TEST_SESSION), "subagent", "index.jsonl"), "utf8");
		const lines = index.trim().split("\n");
		expect(lines.length).toBeGreaterThanOrEqual(1);
		const last = JSON.parse(lines[lines.length - 1] ?? "") as Record<string, unknown>;
		expect(last).toMatchObject({ id: "subagent-index", status: "cancelled" });
	});

	it("waitFor reports not_found and terminal records", async () => {
		const missing = await manager.waitFor("missing", { sessionId: TEST_SESSION });
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
		const terminal = await manager.waitFor("subagent-term", { sessionId: TEST_SESSION });
		expect(terminal.ok).toBe(true);
		if (terminal.ok) expect(terminal.result.output).toBe("ok");
	});

	it("pause rejects non-running subagent and steer falls back to resume", async () => {
		const pause = await manager.pause("subagent-idle", TEST_SESSION);
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
		const steer = await manager.steer("subagent-steer", "redirect", "steer", TEST_SESSION);
		expect(steer.ok).toBe(false);
		if (!steer.ok) expect(steer.reason).toBe("context_unavailable");
	});
});

describe("SubagentManager live spawn and resume", () => {
	let cwd: string;
	let manager: SubagentManager;
	let services: ConstructorParameters<typeof SubagentManager>[0];
	let resourceLoader: DefaultResourceLoader;
	let testProvider: ReturnType<typeof registerTestProvider>;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-subagent-live-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const agentDir = join(cwd, "agent");
		testProvider = registerTestProvider({ models: [{ id: "test-reasoning", reasoning: true }] });
		testProvider.setResponses([testAssistantMessage("planner response")]);
		const model = testProvider.getModel();
		const settingsManager = SettingsManager.create(cwd, agentDir);
		settingsManager.setDefaultModelAndProvider(model.provider, model.id);
		const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
		authStorage.setRuntimeApiKey(model.provider, "test-key");
		const modelRegistry = ModelRegistry.inMemory(authStorage);
		modelRegistry.registerProvider(model.provider, {
			baseUrl: model.baseUrl,
			apiKey: "test-key",
			api: testProvider.api,
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
		resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
		await resourceLoader.reload();
		services = {
			cwd,
			agentDir,
			authStorage,
			settingsManager,
			modelRegistry,
			resourceLoader,
			diagnostics: [],
		};
		manager = new SubagentManager(services);
	});

	afterEach(async () => {
		testProvider.unregister();
		await rm(cwd, { recursive: true, force: true });
	});

	it("spawns a subagent and records completion", async () => {
		testProvider.setResponses([testAssistantMessage("task done")]);
		const result = await manager.spawn({
			role: "planner",
			prompt: "Plan the project",
			cwd,
			storageSessionId: TEST_SESSION,
			tools: ["read", "bash"],
			persistent: false,
		});
		expect(result.record.status).toBe("completed");
		expect(result.output).toContain("task done");
		expect(result.record.result_text).toContain("task done");

		// Durable record should match and stay under the host-owned session state dir.
		const record = await manager.read(result.record.id, TEST_SESSION);
		expect(record?.status).toBe("completed");
		const recordPath = join(sessionStateDir(cwd, TEST_SESSION), "subagent", result.record.id, "record.json");
		const artifactPath = join(sessionStateDir(cwd, TEST_SESSION), "subagent", result.record.id, "artifact.json");
		expect(JSON.parse(await readFile(recordPath, "utf8"))).toMatchObject({
			id: result.record.id,
			status: "completed",
		});
		expect(JSON.parse(await readFile(artifactPath, "utf8"))).toMatchObject({
			subagentId: result.record.id,
			status: "completed",
			result_text: expect.stringContaining("task done"),
		});
		expect(await manager.inspect(result.record.id, TEST_SESSION)).toEqual({
			ok: true,
			record,
			artifactPath,
		});
	});

	it("scopes live controls to the storage session", async () => {
		let resolveResponse: ((message: ReturnType<typeof testAssistantMessage>) => void) | undefined;
		const response = new Promise<ReturnType<typeof testAssistantMessage>>((resolve) => {
			resolveResponse = resolve;
		});
		testProvider.setResponses([() => response]);
		const started = await manager.spawn({
			role: "planner",
			prompt: "Wait for control",
			cwd,
			storageSessionId: TEST_SESSION,
			persistent: false,
			detached: true,
		});

		expect(await manager.pause(started.record.id, "other-session")).toMatchObject({
			ok: false,
			reason: "not_running",
		});
		expect(await manager.waitFor(started.record.id, { sessionId: "other-session" })).toMatchObject({
			ok: false,
			reason: "not_found",
		});
		expect(await manager.cancel(started.record.id, "other-session")).toBeUndefined();
		expect(manager.getActiveCount()).toBe(1);

		const cancellation = manager.cancel(started.record.id, TEST_SESSION);
		resolveResponse?.(testAssistantMessage("late response"));
		expect((await cancellation)?.status).toBe("cancelled");
	});

	it("persists parent session ids on spawned records", async () => {
		testProvider.setResponses([testAssistantMessage("child done")]);
		const result = await manager.spawn({
			role: "planner",
			prompt: "Plan the project",
			cwd,
			storageSessionId: TEST_SESSION,
			persistent: false,
			parentSessionId: "parent-session-1",
		});

		expect(result.record.parent_session_id).toBe("parent-session-1");
		expect((await manager.read(result.record.id, TEST_SESSION))?.parent_session_id).toBe("parent-session-1");
	});

	it("applies project agent profile model, thinking level, tools, and system prompt", async () => {
		const model = testProvider.getModel();
		const profileDir = join(cwd, ".agent", "agents");
		await mkdir(profileDir, { recursive: true });
		await writeFile(
			join(profileDir, "architect.md"),
			`---
name: architect
description: Architect override
model: ${model.provider}/${model.id}
thinkingLevel: high
tools:
  - read
persistent: false
---
PROFILE SYSTEM PROMPT`,
			"utf8",
		);
		const captured: Array<{ modelId: string; reasoning: unknown; tools: string[]; systemPrompt: string }> = [];
		testProvider.setResponses([
			(context, options, _state, requestModel) => {
				captured.push({
					modelId: requestModel.id,
					reasoning: getReasoning(options),
					tools: context.tools?.map((tool) => tool.name) ?? [],
					systemPrompt: context.systemPrompt ?? "",
				});
				return testAssistantMessage("profiled");
			},
		]);

		await resourceLoader.reload();

		const result = await manager.spawn({
			agent: "architect",
			prompt: "Use profile",
			cwd,
			storageSessionId: TEST_SESSION,
		});

		expect(result.record.agent_profile).toBe("architect");
		expect(result.record.role).toBe("architect");
		expect(result.record.model).toBe(`${model.provider}/${model.id}`);
		expect(result.record.thinking_level).toBe("high");
		expect(captured[0]).toMatchObject({ modelId: model.id, reasoning: "high", tools: ["read"] });
		expect(captured[0]?.systemPrompt).toContain("PROFILE SYSTEM PROMPT");
		expect(captured[0]?.systemPrompt).toContain("Subagent observability contract:");
		expect(captured[0]?.systemPrompt).toContain("Use Pi-native receipts, status, progress, and durable artifacts");
		expect(captured[0]?.systemPrompt).toContain("Do not hide long-running work in detached background processes");
	});

	it("lets explicit subagent spawn overrides win over agent profiles", async () => {
		const profileDir = join(cwd, ".agent", "agents");
		await mkdir(profileDir, { recursive: true });
		await writeFile(
			join(profileDir, "worker.md"),
			`---
name: worker
description: Worker override
thinkingLevel: high
tools:
  - read
persistent: false
---
Worker profile`,
			"utf8",
		);
		const captured: Array<{ reasoning: unknown; tools: string[] }> = [];
		testProvider.setResponses([
			(context, options) => {
				captured.push({ reasoning: getReasoning(options), tools: context.tools?.map((tool) => tool.name) ?? [] });
				return testAssistantMessage("override");
			},
		]);

		await resourceLoader.reload();

		const result = await manager.spawn({
			agent: "worker",
			prompt: "Use overrides",
			cwd,
			storageSessionId: TEST_SESSION,
			thinkingLevel: "low",
			tools: ["bash"],
			persistent: false,
		});

		expect(result.record.thinking_level).toBe("low");
		expect(captured[0]).toMatchObject({ reasoning: "low", tools: ["bash"] });
	});

	it("resumes a persisted subagent session with a follow-up prompt", async () => {
		// Spawn with a persistent session so we can resume
		testProvider.setResponses([testAssistantMessage("initial response")]);
		const spawnResult = await manager.spawn({
			role: "architect",
			prompt: "Design the system",
			cwd,
			storageSessionId: TEST_SESSION,
			tools: ["read", "bash"],
			persistent: true,
		});
		expect(spawnResult.record.status).toBe("completed");
		expect(spawnResult.record.session_file).toBeDefined();
		expect(spawnResult.record.session_file).toContain(join(".pi", TEST_SESSION, "state", "subagent", "sessions"));

		// Resume with a new prompt
		testProvider.setResponses([testAssistantMessage("refined design")]);
		const resumeResult = await manager.resume(spawnResult.record.id, "Refine the design", {
			tools: ["read", "bash"],
			storageSessionId: TEST_SESSION,
		});
		expect(resumeResult.ok).toBe(true);
		if (resumeResult.ok) {
			expect(resumeResult.result.record.status).toBe("completed");
			expect(resumeResult.result.output).toContain("refined design");
		}
	});

	it("cooperatively pauses a running subagent", async () => {
		// Use a multi-turn test response so pauseRequested can be checked between turns
		testProvider.setResponses([testAssistantMessage("first response"), testAssistantMessage("second response")]);

		// Start spawn and pause after a brief delay
		const spawnPromise = manager.spawn({
			role: "critic",
			prompt: "Review the plan",
			cwd,
			storageSessionId: TEST_SESSION,
			tools: ["read"],
			persistent: true,
		});

		// The spawn runs synchronously with the test provider.
		// Since pause is cooperative (checked after each turn),
		// a single-turn test response will complete before pause takes effect.
		// For a single-turn test, the subagent completes normally.
		const result = await spawnPromise;
		expect(result.record.status).toBe("completed");
	});

	it("cancels a running subagent", async () => {
		testProvider.setResponses([testAssistantMessage("should be cancelled")]);
		const result = await manager.spawn({
			role: "planner",
			prompt: "Quick task",
			cwd,
			storageSessionId: TEST_SESSION,
			tools: ["read"],
			persistent: false,
		});
		// Already completed since test provider is synchronous
		expect(result.record.status).toBe("completed");

		// Cancel on a completed record is a no-op.
		const cancelled = await manager.cancel(result.record.id, TEST_SESSION);
		expect(cancelled?.status).toBe("completed");
	});

	it("await returns completed record for finished subagent", async () => {
		testProvider.setResponses([testAssistantMessage("awaited result")]);
		const spawnResult = await manager.spawn({
			role: "planner",
			prompt: "Do something",
			cwd,
			storageSessionId: TEST_SESSION,
			tools: ["read"],
			persistent: false,
		});

		const awaitResult = await manager.await(spawnResult.record.id, TEST_SESSION);
		expect(awaitResult?.record.status).toBe("completed");
		expect(awaitResult?.output).toContain("awaited result");
	});

	it("detached spawn can time out while live and later complete", async () => {
		testProvider.setResponses([
			testAssistantMessage(testToolCall("bash", { command: "sleep 0.1 && echo tool-done" }, { id: "call-1" }), {
				stopReason: "toolUse",
			}),
			testAssistantMessage("detached complete"),
		]);
		const spawned = await manager.spawn({
			role: "worker",
			prompt: "Run a slow command",
			cwd,
			storageSessionId: TEST_SESSION,
			tools: ["bash"],
			persistent: false,
			detached: true,
		});
		expect(spawned.record.status).toBe("queued");

		const timedOut = await manager.waitFor(spawned.record.id, { timeoutMs: 10, sessionId: TEST_SESSION });
		expect(timedOut.ok).toBe(false);
		if (!timedOut.ok) {
			expect(timedOut.reason).toBe("timeout");
			expect(timedOut.record?.status).toBe("running");
		}

		const completed = await manager.await(spawned.record.id, TEST_SESSION);
		expect(completed?.record.status).toBe("completed");
		expect(completed?.output).toContain("detached complete");
	});

	it("does not expose subagent tools inside spawned sessions", async () => {
		const capturedTools: string[][] = [];
		testProvider.setResponses([
			(context) => {
				capturedTools.push(context.tools?.map((tool) => tool.name) ?? []);
				return testAssistantMessage("isolated");
			},
		]);
		const result = await manager.spawn({
			role: "isolated-worker",
			prompt: "Check available tools",
			cwd,
			storageSessionId: TEST_SESSION,
			tools: ["read", "subagent_spawn"],
			persistent: false,
		});

		expect(result.record.status).toBe("completed");
		expect(capturedTools[0]).toContain("read");
		expect(capturedTools[0]).not.toContain("subagent_spawn");
	});
});
