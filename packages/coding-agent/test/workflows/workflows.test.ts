import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWorkflowCommand } from "../../src/cli/workflow-command.ts";
import { buildResponse } from "../../src/harness-runtime/state.ts";
import {
	generateSessionId,
	readRuntimeReceipts,
	readSessionState,
	resolveHarnessRoot,
	sessionPaths,
	writeSessionState,
} from "../../src/harness-runtime/storage.ts";
import { SESSION_SCHEMA_VERSION, type SessionState } from "../../src/harness-runtime/types.ts";
import {
	appendJsonlIdempotent,
	readExistingStateForMutation,
	readFileOrLiteral,
	writeTextArtifact,
} from "../../src/workflows/shared/state-writer.ts";
import { readWorkflowState, writeWorkflowState } from "../../src/workflows/shared/workflow-state.ts";

describe("workflow runtime", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-workflows-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("writes workflow state with receipt and checksum", async () => {
		const state = await writeWorkflowState(cwd, "ralplan", { current_phase: "planner", run_id: "run-1" });

		expect(state.skill).toBe("ralplan");
		expect(state.version).toBe(1);
		expect(state.active).toBe(true);
		expect(state.receipt).toMatchObject({ owner: "pi-workflow", skill: "ralplan" });
		expect((state.receipt as Record<string, unknown>).content_sha256).toMatchObject({ algorithm: "sha256" });

		const reread = await readWorkflowState(cwd, "ralplan");
		expect(reread?.run_id).toBe("run-1");
	});

	it("reports corrupt state for mutation reads", async () => {
		const path = join(cwd, ".pi", "workflows", "ralplan", "state.json");
		await mkdir(join(cwd, ".pi", "workflows", "ralplan"), { recursive: true });
		await writeFile(path, "not json", "utf8");

		const result = await readExistingStateForMutation(path);
		expect(result.kind).toBe("corrupt");
		await expect(writeWorkflowState(cwd, "ralplan", { current_phase: "planner" })).rejects.toThrow(/corrupt/);
	});

	it("rejects writes outside project .pi when cwd confinement is supplied", async () => {
		await expect(writeTextArtifact(join(cwd, "outside.md"), "nope", { cwd })).rejects.toThrow(/\.pi/);
	});

	it("supports pi workflow state as the centralized state command", async () => {
		const written = await runWorkflowCommand(
			["state", "ralplan", "write", "--input", '{"phase":"planner","active":true,"run_id":"run-2"}', "--json"],
			cwd,
		);
		expect(written.status).toBe(0);
		const writtenJson = JSON.parse(written.stdout) as { state: { current_phase?: string; run_id?: string } };
		expect(writtenJson.state.current_phase).toBe("planner");
		expect(writtenJson.state.run_id).toBe("run-2");
	});

	it("supports pi workflow state handoff and active snapshot updates", async () => {
		const handoff = await runWorkflowCommand(
			["state", "deep-interview", "handoff", "--to", "ralplan", "--json"],
			cwd,
		);
		expect(handoff.status).toBe(0);
		const handoffJson = JSON.parse(handoff.stdout) as {
			state: { active?: boolean };
			target_state: { active?: boolean };
		};
		expect(handoffJson.state.active).toBe(false);
		expect(handoffJson.target_state.active).toBe(true);

		const active = await runWorkflowCommand(["state", "active", "--json"], cwd);
		expect(active.status).toBe(0);
		const activeJson = JSON.parse(active.stdout) as { state: { active_workflows?: Array<{ skill: string }> } };
		expect(activeJson.state.active_workflows).toEqual([
			{
				skill: "ralplan",
				active: true,
				phase: "handoff",
				state_path: expect.any(String),
				updated_at: expect.any(String),
			},
		]);
	});

	it("appends JSONL idempotently", async () => {
		const path = join(cwd, ".pi", "plans", "ralplan", "run-1", "index.jsonl");
		const row = { stage: "planner", stage_n: 1, sha256: "abc" };
		const key = (entry: unknown): string | undefined => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
			const record = entry as Record<string, unknown>;
			return `${record.stage}:${record.stage_n}:${record.sha256}`;
		};

		expect((await appendJsonlIdempotent(path, row, { cwd, key })).appended).toBe(true);
		expect((await appendJsonlIdempotent(path, row, { cwd, key })).appended).toBe(false);
		expect((await readFile(path, "utf8")).trim().split(/\r?\n/)).toHaveLength(1);
	});

	it("writes artifacts inside .pi", async () => {
		const path = join(cwd, ".pi", "specs", "demo.md");
		const result = await writeTextArtifact(path, "hello", { cwd });
		expect(result.sha256).toHaveLength(64);
		expect(await readFile(path, "utf8")).toBe("hello\n");
	});

	it("starts and observes workflow runtime state handles", async () => {
		const started = await runWorkflowCommand([
			"start",
			"--input",
			JSON.stringify({ workspace: cwd, sessionId: "h-test" }),
			"--json",
		]);
		expect(started.status).toBe(0);
		const startedJson = JSON.parse(started.stdout) as {
			state: { sessionId?: string; lifecycle?: string; ownerLive?: boolean };
			evidence: { handle?: { harness?: string; workspace?: string; rpcHandle?: { sessionDir?: string } } };
		};
		expect(startedJson.state).toMatchObject({ sessionId: "h-test", lifecycle: "started", ownerLive: false });
		expect(startedJson.evidence.handle).toMatchObject({ harness: "pi", workspace: cwd });
		expect(startedJson.evidence.handle?.rpcHandle?.sessionDir).toContain(".pi/state/harness");
		const receipts = await readRuntimeReceipts(resolveHarnessRoot({ cwd }), "h-test");
		expect(receipts.rows).toHaveLength(1);
		expect(receipts.rows[0]).toMatchObject({ verb: "start", accepted: true, sessionId: "h-test" });

		const observed = await runWorkflowCommand([
			"observe",
			"--input",
			JSON.stringify({ workspace: cwd, sessionId: "h-test" }),
			"--json",
		]);
		expect(observed.status).toBe(0);
		const observedJson = JSON.parse(observed.stdout) as {
			evidence: { observation?: { cwd?: string; submitUnavailableReason?: string } };
			nextAllowedActions: Array<{ verb: string; available: boolean; reason?: string }>;
		};
		expect(observedJson.evidence.observation).toMatchObject({ cwd, submitUnavailableReason: "owner-not-live" });
		expect(observedJson.nextAllowedActions).toContainEqual({
			verb: "submit",
			available: false,
			reason: "owner-not-live",
		});
	});

	it("persists a runtime state handle under .pi state", async () => {
		const root = resolveHarnessRoot({ cwd });
		const sessionId = generateSessionId();
		const paths = sessionPaths(root, sessionId);
		const now = new Date().toISOString();
		const state: SessionState = {
			schemaVersion: SESSION_SCHEMA_VERSION,
			sessionId,
			lifecycle: "started",
			harness: "pi",
			handle: {
				sessionId,
				harness: "pi",
				workspace: cwd,
				repo: null,
				branch: null,
				base: null,
				issueOrPr: null,
				processHandle: { kind: "runtime-owner", ownerId: null, pid: null },
				rpcHandle: { kind: "rpc-subprocess", pid: null, sessionDir: paths.piSessionDir },
				ownerHandle: { leasePath: paths.lease, endpoint: null, heartbeatAt: null },
				routerHandle: { kind: "default-in-owner", policy: "workflow-runtime", eventsPath: paths.events },
				viewportHandle: { kind: "event-monitor", tmuxSessionName: null, viewOnly: true },
				startedAt: now,
				updatedAt: now,
			},
			retries: {},
			blockers: [],
			createdAt: now,
			updatedAt: now,
		};

		await writeSessionState(root, state);
		expect(await readSessionState(root, sessionId)).toMatchObject({ sessionId, handle: { workspace: cwd } });
		expect(buildResponse(state, false, { handle: state.handle }).nextAllowedActions).toContainEqual({
			verb: "submit",
			available: false,
			reason: "owner-not-live",
		});
	});

	describe("readFileOrLiteral", () => {
		it("returns a short literal string as-is", async () => {
			expect(await readFileOrLiteral("just some prose", cwd)).toBe("just some prose");
		});

		it("returns multi-line markdown content as literal (regression: ENAMETOOLONG)", async () => {
			const markdown = [
				"# Plan",
				"",
				"A long multi-line plan body with enough content to exceed NAME_MAX when",
				`interpreted as a single path component. ${"x".repeat(300)}`,
			].join("\n");
			expect(await readFileOrLiteral(markdown, cwd)).toBe(markdown);
		});

		it("returns an over-long single-line string as literal", async () => {
			const long = "a".repeat(5000);
			expect(await readFileOrLiteral(long, cwd)).toBe(long);
		});

		it("reads an existing file path", async () => {
			const filePath = join(cwd, "draft.md");
			await writeFile(filePath, "# Draft\nbody\n", "utf8");
			expect(await readFileOrLiteral(filePath, cwd)).toBe("# Draft\nbody\n");
		});

		it("returns a nonexistent relative path as literal", async () => {
			expect(await readFileOrLiteral("does/not/exist.md", cwd)).toBe("does/not/exist.md");
		});
	});
});
