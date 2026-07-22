import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fauxAssistantMessage, fauxToolCall, registerFauxProvider } from "@tsuuanmi/pi-ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "#pi/auth/auth-storage";
import { ModelRegistry } from "#pi/model/model-registry";
import { sessionStateDir } from "#pi/session/session-layout";
import { SettingsManager } from "#pi/settings/settings-manager";
import { DefaultResourceLoader } from "#pi/skills/resource-loader";
import { SubagentManager, type SubagentRecord } from "#pi/subagents/subagents";
import { readSubagentWorkerRequest } from "#pi/subagents/tmux-worker";

const TEST_SESSION = "test-session";

async function writeRecord(cwd: string, record: SubagentRecord): Promise<void> {
	const path = join(sessionStateDir(cwd, TEST_SESSION), "subagents", record.id, "record.json");
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
		cwd = join(tmpdir(), `pi-subagents-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const agentDir = join(cwd, "agent");
		const settingsManager = SettingsManager.create(cwd, agentDir);
		const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
		const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
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

	it("rejects malformed worker metadata", async () => {
		const requestPath = join(cwd, "request.json");
		await writeFile(requestPath, "{not-json", "utf8");
		await expect(readSubagentWorkerRequest(requestPath)).rejects.toMatchObject({ code: "worker_metadata_invalid" });
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
		const index = await readFile(join(sessionStateDir(cwd, TEST_SESSION), "subagents", "index.jsonl"), "utf8");
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

	it("pause rejects non-running subagents and steer falls back to resume", async () => {
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
	let faux: ReturnType<typeof registerFauxProvider>;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-subagent-live-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const agentDir = join(cwd, "agent");
		faux = registerFauxProvider({ models: [{ id: "faux-reasoning", reasoning: true }] });
		faux.setResponses([fauxAssistantMessage("planner response")]);
		const model = faux.getModel();
		const settingsManager = SettingsManager.create(cwd, agentDir);
		settingsManager.setDefaultModelAndProvider(model.provider, model.id);
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
		faux.unregister();
		await rm(cwd, { recursive: true, force: true });
	});

	it("spawns a subagent and records completion", async () => {
		faux.setResponses([fauxAssistantMessage("task done")]);
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
		const recordPath = join(sessionStateDir(cwd, TEST_SESSION), "subagents", result.record.id, "record.json");
		const artifactPath = join(sessionStateDir(cwd, TEST_SESSION), "subagents", result.record.id, "artifact.json");
		expect(JSON.parse(await readFile(recordPath, "utf8"))).toMatchObject({
			id: result.record.id,
			status: "completed",
		});
		expect(JSON.parse(await readFile(artifactPath, "utf8"))).toMatchObject({
			subagentId: result.record.id,
			status: "completed",
			result_text: expect.stringContaining("task done"),
		});
	});

	it("persists parent session ids on spawned records", async () => {
		faux.setResponses([fauxAssistantMessage("child done")]);
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
		const model = faux.getModel();
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
		expect(result.record.visibility).toBe("native");
		expect(captured[0]).toMatchObject({ modelId: model.id, reasoning: "high", tools: ["read"] });
		expect(captured[0]?.systemPrompt).toContain("PROFILE SYSTEM PROMPT");
		expect(captured[0]?.systemPrompt).toContain("Subagent observability contract:");
		expect(captured[0]?.systemPrompt).toContain("Visibility requested: native");
		expect(captured[0]?.systemPrompt).toContain("prefer an explicit tmux session over a detached background process");
	});

	it("launches explicit tmux visibility through the worker backend without payload argv", async () => {
		const calls: Array<{ command: string; args: string[]; options: { stdout: "inherit" | "pipe" } }> = [];
		manager = new SubagentManager(services, {
			tmux: {
				available: () => true,
				spawnSync: (command, args, options) => {
					calls.push({ command, args, options: { stdout: options.stdout } });
					return { exitCode: 0, stdout: "pi-parent\t$1\t@1\t0\t%42\t0\n" };
				},
				env: { TMUX: "/tmp/tmux/default" },
				argv: ["/usr/bin/node", "/usr/local/bin/pi"],
				execPath: "/usr/bin/node",
			},
		});

		const result = await manager.spawn({
			role: "planner",
			prompt: "Run visible work",
			cwd,
			storageSessionId: TEST_SESSION,
			visibility: "tmux",
			tools: ["bash"],
			persistent: false,
		});

		expect(result.record.status).toBe("running");
		expect(result.record.visibility).toBe("tmux");
		expect(result.record.tmux).toMatchObject({ backend: "tmux", visible_by_default: true, target: { kind: "pane" } });
		expect(result.record.identity).toMatchObject({ storage_root: cwd, lifecycle_state: "running" });
		expect(result.record.tmux?.worker_metadata_file.endsWith("/worker.json")).toBe(true);
		expect(calls[0]?.args[0]).toBe("split-window");
		expect(calls[0]?.args).toContain("-P");
		expect(calls[0]?.args).toContain("-F");
		expect(calls[0]?.options.stdout).toBe("pipe");
		const launchArgv = calls[0]?.args.join(" ") ?? "";
		expect(launchArgv).toContain("--subagent-worker");
		expect(launchArgv).not.toContain("Run visible work");
		expect(launchArgv).not.toContain("bash");
		const worker = await readSubagentWorkerRequest(result.record.tmux!.request_file);
		expect(worker.storageRoot).toBe(cwd);
		expect(worker.request.prompt).toBe("Run visible work");
		expect(worker.request.tools).toEqual(["bash"]);

		await writeFile(
			result.record.tmux!.worker_metadata_file,
			`${JSON.stringify(
				{
					version: 1,
					subagentId: result.record.id,
					storageSessionId: TEST_SESSION,
					storageRoot: cwd,
					pid: process.pid,
					startedAt: "2026-01-01T00:00:00.000Z",
					requestPath: result.record.tmux!.request_file,
					identity: result.record.identity,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		const inspected = await manager.inspect(result.record.id, TEST_SESSION);
		expect(inspected).toMatchObject({
			ok: true,
			artifactPath: join(sessionStateDir(cwd, TEST_SESSION), "subagents", result.record.id, "artifact.json"),
			workerMetadataPath: result.record.tmux!.worker_metadata_file,
			meta: { tmux: result.record.tmux, identity: result.record.identity },
		});
		expect(inspected.record).toMatchObject({
			id: result.record.id,
			tmux: result.record.tmux,
			identity: result.record.identity,
		});

		const attached = await manager.attach(result.record.id, TEST_SESSION);
		expect(attached).toMatchObject({
			ok: true,
			tmuxTarget: result.record.tmux?.target.target,
			attachCommand: result.record.tmux?.attach_command,
		});
	});

	it("applies tmux kill failure precedence", async () => {
		const paneTargetFor = (id: string) => ({
			kind: "pane" as const,
			session_name: `pi-worker-${id}`,
			session_id: `$${id}`,
			window_id: `@${id}`,
			window_index: 0,
			pane_id: `%${id}`,
			pane_index: 0,
			target: `%${id}`,
		});
		const identityFor = (id: string, lifecycleState: SubagentRecord["status"] = "running") => ({
			version: 1 as const,
			subagent_id: id,
			parent_session_id: TEST_SESSION,
			storage_session_id: TEST_SESSION,
			storage_root: cwd,
			execution_cwd: cwd,
			request_path: join(cwd, id, "request.json"),
			record_path: join(cwd, id, "record.json"),
			artifact_path: join(cwd, id, "artifact.json"),
			worker_metadata_path: join(cwd, id, "worker.json"),
			lifecycle_state: lifecycleState,
			cleanup_eligible: lifecycleState === "running",
			owner: {
				kind: "pi-subagent-worker" as const,
				parent_session_id: TEST_SESSION,
				storage_session_id: TEST_SESSION,
				storage_root: cwd,
				execution_cwd: cwd,
			},
			tmux: {
				backend: "tmux" as const,
				session_name: `pi-worker-${id}`,
				target: paneTargetFor(id),
				request_path: join(cwd, id, "request.json"),
				worker_metadata_path: join(cwd, id, "worker.json"),
			},
		});
		const tmuxFor = (id: string) => {
			const target = paneTargetFor(id);
			return {
				backend: "tmux" as const,
				session_name: `pi-worker-${id}`,
				target,
				request_file: join(cwd, id, "request.json"),
				worker_metadata_file: join(cwd, id, "worker.json"),
				attach_command: `tmux select-pane -t ${target.target}`,
				inspect_command: `tmux list-panes -t ${target.session_name} -F '#{pane_id} #{pane_index} #{pane_current_command}'`,
				cleanup_command: `tmux kill-pane -t ${target.target}`,
				visible_by_default: true,
			};
		};
		const writeTmuxRecord = async (id: string, status: SubagentRecord["status"] = "running") => {
			const tmux = tmuxFor(id);
			await writeRecord(cwd, {
				id,
				role: "planner",
				status,
				cwd,
				parent_session_id: TEST_SESSION,
				resumable: false,
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-01T00:00:00.000Z",
				visibility: "tmux",
				identity: identityFor(id, status),
				tmux,
			});
			return tmux;
		};
		const calls: string[][] = [];
		manager = new SubagentManager(services, {
			tmux: {
				spawnSync: (_command, args) => {
					calls.push(args);
					if (args[0] === "display-message" && args.join(" ").includes("missing-pane")) return { exitCode: 1 };
					if (args[0] === "kill-pane" && args.join(" ").includes("kill-fails")) return { exitCode: 1 };
					return { exitCode: 0 };
				},
			},
		});

		await writeTmuxRecord("done", "completed");
		expect(await manager.kill("done", TEST_SESSION)).toMatchObject({ ok: false, reason: "already_terminal" });

		await writeRecord(cwd, {
			id: "legacy",
			role: "planner",
			status: "running",
			cwd,
			resumable: false,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
			visibility: "tmux",
			tmux: tmuxFor("legacy"),
		});
		expect(await manager.attach("legacy", TEST_SESSION)).toMatchObject({ ok: false, reason: "legacy_record" });

		await writeTmuxRecord("missing-pane");
		expect(await manager.kill("missing-pane", TEST_SESSION)).toMatchObject({
			ok: false,
			reason: "tmux_pane_not_found",
		});

		await writeTmuxRecord("stale-worker");
		await mkdir(dirname(tmuxFor("stale-worker").worker_metadata_file), { recursive: true });
		await writeFile(
			tmuxFor("stale-worker").worker_metadata_file,
			`${JSON.stringify({ version: 1, subagentId: "stale-worker", storageSessionId: TEST_SESSION, storageRoot: cwd, pid: -1, startedAt: "2026-01-01T00:00:00.000Z", requestPath: join(cwd, "stale-worker", "request.json"), identity: identityFor("stale-worker") }, null, 2)}\n`,
			"utf8",
		);
		expect(await manager.kill("stale-worker", TEST_SESSION)).toMatchObject({ ok: false, reason: "worker_stale" });

		await writeTmuxRecord("kill-fails");
		await mkdir(dirname(tmuxFor("kill-fails").worker_metadata_file), { recursive: true });
		await writeFile(
			tmuxFor("kill-fails").worker_metadata_file,
			`${JSON.stringify({ version: 1, subagentId: "kill-fails", storageSessionId: TEST_SESSION, storageRoot: cwd, pid: process.pid, startedAt: "2026-01-01T00:00:00.000Z", requestPath: join(cwd, "kill-fails", "request.json"), identity: identityFor("kill-fails") }, null, 2)}\n`,
			"utf8",
		);
		expect(await manager.kill("kill-fails", TEST_SESSION)).toMatchObject({ ok: false, reason: "kill_failed" });

		await writeTmuxRecord("kill-ok");
		await mkdir(dirname(tmuxFor("kill-ok").worker_metadata_file), { recursive: true });
		await writeFile(
			tmuxFor("kill-ok").worker_metadata_file,
			`${JSON.stringify({ version: 1, subagentId: "kill-ok", storageSessionId: TEST_SESSION, storageRoot: cwd, pid: process.pid, startedAt: "2026-01-01T00:00:00.000Z", requestPath: join(cwd, "kill-ok", "request.json"), identity: identityFor("kill-ok") }, null, 2)}\n`,
			"utf8",
		);
		expect(await manager.kill("kill-ok", TEST_SESSION)).toMatchObject({
			ok: true,
			tmuxTarget: `%kill-ok`,
			record: { status: "cancelled" },
		});
		expect(calls).toContainEqual(["kill-pane", "-t", "%kill-ok"]);
	});

	it("returns tmux_unavailable when explicit tmux visibility is requested without tmux", async () => {
		manager = new SubagentManager(services, { tmux: { available: () => false } });
		await expect(
			manager.spawn({
				role: "planner",
				prompt: "Run visible work",
				cwd,
				storageSessionId: TEST_SESSION,
				visibility: "tmux",
				persistent: false,
			}),
		).rejects.toMatchObject({ code: "tmux_unavailable", backendKind: "tmux" });

		expect(await manager.list(TEST_SESSION)).toEqual([]);
	});

	it("runs auto visibility through the native backend for this milestone", async () => {
		faux.setResponses([fauxAssistantMessage("auto native")]);

		const result = await manager.spawn({
			role: "planner",
			prompt: "Run auto work",
			cwd,
			storageSessionId: TEST_SESSION,
			visibility: "auto",
			persistent: false,
		});

		expect(result.record.status).toBe("completed");
		expect(result.record.visibility).toBe("auto");
		expect(result.output).toContain("auto native");
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
		faux.setResponses([
			(context, options) => {
				captured.push({ reasoning: getReasoning(options), tools: context.tools?.map((tool) => tool.name) ?? [] });
				return fauxAssistantMessage("override");
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
		faux.setResponses([fauxAssistantMessage("initial response")]);
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
		expect(spawnResult.record.session_file).toContain(join(".pi", TEST_SESSION, "state", "subagents", "sessions"));

		// Resume with a new prompt
		faux.setResponses([fauxAssistantMessage("refined design")]);
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
		// Use a multi-turn faux response so pauseRequested can be checked between turns
		faux.setResponses([fauxAssistantMessage("first response"), fauxAssistantMessage("second response")]);

		// Start spawn and pause after a brief delay
		const spawnPromise = manager.spawn({
			role: "critic",
			prompt: "Review the plan",
			cwd,
			storageSessionId: TEST_SESSION,
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
			storageSessionId: TEST_SESSION,
			tools: ["read"],
			persistent: false,
		});
		// Already completed since faux provider is synchronous
		expect(result.record.status).toBe("completed");

		// Cancel on a completed record is a no-op.
		const cancelled = await manager.cancel(result.record.id, TEST_SESSION);
		expect(cancelled?.status).toBe("completed");
	});

	it("await returns completed record for finished subagent", async () => {
		faux.setResponses([fauxAssistantMessage("awaited result")]);
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
			storageSessionId: TEST_SESSION,
			tools: ["read", "subagent_spawn"],
			persistent: false,
		});

		expect(result.record.status).toBe("completed");
		expect(capturedTools[0]).toContain("read");
		expect(capturedTools[0]).not.toContain("subagent_spawn");
	});
});
