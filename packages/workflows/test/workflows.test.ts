import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import "../src/harness/deep-interview/deep-interview-transitions.ts";
import "../src/harness/ralplan/ralplan-transitions.ts";
import "../src/harness/team/team-transitions.ts";
import "../src/harness/ultragoal/ultragoal-transitions.ts";
import {
	appendJsonlIdempotent,
	assertExpectedNextRole,
	assertNoGuardedSpawnOverrides,
	buildRalplanRoleSystemPrompt,
	buildRalplanTaskPrompt,
	completeTeam,
	createTeamTask,
	expectedNextRalplanRole,
	expectedNextTeamRole,
	PI_WORKFLOW_MANIFEST,
	type RalplanSelectorVerdict,
	readExistingStateForMutation,
	readFileOrLiteral,
	readRalplanStatus,
	readTeamSnapshot,
	readWorkflowActiveState,
	readWorkflowState,
	recordRalplanExplorerGateArtifact,
	recordTeamCompletionGateArtifact,
	recordTeamReviewGateArtifact,
	runRalplanAgent,
	startTeam,
	syncWorkflowActiveState,
	transitionTeamTask,
	writeRalplanArtifact,
	writeTextArtifact,
	writeWorkflowState,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWorkflowCommand } from "../src/commands/workflow.ts";
import workflowsExtension from "../src/extensions/workflows.ts";
import { buildResponse } from "../src/harness/runtime/state.ts";
import {
	generateSessionId,
	readRuntimeReceipts,
	readSessionState,
	resolveHarnessRoot,
	sessionPaths,
	writeSessionState,
} from "../src/harness/runtime/storage.ts";
import { SESSION_SCHEMA_VERSION, type SessionState } from "../src/harness/runtime/types.ts";
import {
	isBlockingQuestionPhaseForSkill,
	skillGateValidators,
	skillTerminalDetectors,
} from "../src/harness/shared/registry/skill-registry.ts";

const sessionId = "test-session-id";
const execFileAsync = promisify(execFile);
const builtPiCliPath = fileURLToPath(new URL("../../coding-agent/dist/cli.js", import.meta.url));

async function runBuiltPiWorkflow(
	args: string[],
	cwd: string,
): Promise<{ status: number; stdout: string; stderr: string }> {
	try {
		const result = await execFileAsync(process.execPath, [builtPiCliPath, "workflow", ...args], {
			cwd,
			env: { ...process.env, PI_OFFLINE: "1" },
			maxBuffer: 1024 * 1024,
		});
		return { status: 0, stdout: result.stdout, stderr: result.stderr };
	} catch (error) {
		const failed = error as { code?: unknown; stdout?: unknown; stderr?: unknown };
		return {
			status: typeof failed.code === "number" ? failed.code : 1,
			stdout: typeof failed.stdout === "string" ? failed.stdout : "",
			stderr: typeof failed.stderr === "string" ? failed.stderr : String(error),
		};
	}
}

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
		const state = await writeWorkflowState(
			cwd,
			"ralplan",
			{ current_phase: "planner", run_id: "run-1" },
			"pi workflow state write",
			{ sessionId },
		);

		expect(state.skill).toBe("ralplan");
		expect(state.version).toBe(1);
		expect(state.active).toBe(true);
		expect(state.receipt).toMatchObject({ owner: "pi-workflow", skill: "ralplan" });
		expect((state.receipt as Record<string, unknown>).content_sha256).toMatchObject({ algorithm: "sha256" });

		const reread = await readWorkflowState(cwd, "ralplan", { sessionId });
		expect(reread?.run_id).toBe("run-1");
	});

	it("reports corrupt state for mutation reads", async () => {
		const path = join(cwd, ".pi", sessionId, "workflows", "ralplan", "state.json");
		await mkdir(join(cwd, ".pi", sessionId, "workflows", "ralplan"), { recursive: true });
		await writeFile(path, "not json", "utf8");

		const result = await readExistingStateForMutation(path);
		expect(result.kind).toBe("corrupt");
		await expect(
			writeWorkflowState(cwd, "ralplan", { current_phase: "planner" }, "pi workflow state write", { sessionId }),
		).rejects.toThrow(/corrupt/);
	});

	it("rejects writes outside project .pi when cwd confinement is supplied", async () => {
		await expect(writeTextArtifact(join(cwd, "outside.md"), "nope", { cwd })).rejects.toThrow(/\.pi/);
	});

	it("dispatches workflow commands through the built coding-agent CLI", async () => {
		const result = await runBuiltPiWorkflow(
			[
				"deep-interview",
				"read-compact",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId: "cli-pipeline" }),
				"--json",
			],
			cwd,
		);
		expect(result.status).toBe(0);
		const json = JSON.parse(result.stdout) as {
			ok?: boolean;
			body?: { statePath?: string; state?: { threshold?: number } };
		};
		expect(json.ok).toBe(true);
		expect(json.body?.state?.threshold).toBe(0.05);
		expect(json.body?.statePath).toContain(".pi/cli-pipeline/workflows/deep-interview/state.json");
	});

	it("rejects removed workflow spawn command shims with model-visible tool guidance", async () => {
		const ralplan = await runWorkflowCommand([
			"ralplan",
			"run-agent",
			"--input",
			JSON.stringify({ sessionId, runId: "run-removed" }),
			"--json",
		]);
		expect(ralplan.status).toBe(1);
		expect(ralplan.stderr).toMatch(/ralplan_run_agent model-visible tool/);

		const team = await runWorkflowCommand([
			"team",
			"spawn-task-agent",
			"--input",
			JSON.stringify({ sessionId, teamId: "team-removed", taskId: "task-1" }),
			"--json",
		]);
		expect(team.status).toBe(1);
		expect(team.stderr).toMatch(/team_spawn_task_agent model-visible tool/);

		const ultragoal = await runWorkflowCommand([
			"ultragoal",
			"spawn-goal-agent",
			"--input",
			JSON.stringify({ sessionId, goalId: "goal-1" }),
			"--json",
		]);
		expect(ultragoal.status).toBe(1);
		expect(ultragoal.stderr).toMatch(/ultragoal_spawn_goal_agent model-visible tool/);
	});

	it("requires explicit session ids for workflow skill commands", async () => {
		const result = await runWorkflowCommand(["deep-interview", "read-compact", "--input", "{}", "--json"], cwd);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/sessionId is required/);
	});

	it("limits workflow gc flags to the gc verb", async () => {
		const result = await runWorkflowCommand([
			"deep-interview",
			"read-compact",
			"--input",
			JSON.stringify({ sessionId }),
			"--prune",
			"--json",
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/--prune\/--dry-run are only supported for pi workflow gc/);
	});

	it("supports file-backed input for workflow verbs", async () => {
		const inputPath = join(cwd, "payload.json");
		await writeFile(inputPath, JSON.stringify({ sessionId, lastN: 1 }), "utf8");

		const relative = await runWorkflowCommand(
			["deep-interview", "read-compact", "--input-file", "payload.json", "--json"],
			cwd,
		);
		expect(relative.status).toBe(0);
		expect(JSON.parse(relative.stdout)).toMatchObject({ ok: true });

		const absolute = await runWorkflowCommand(
			["deep-interview", "read-compact", "--input-file", inputPath, "--json"],
			cwd,
		);
		expect(absolute.status).toBe(0);
		expect(JSON.parse(absolute.stdout)).toMatchObject({ ok: true });
	});

	it("rejects invalid workflow --input-file usage", async () => {
		const scalarPath = join(cwd, "scalar.json");
		await writeFile(scalarPath, "[]", "utf8");

		const missingOperand = await runWorkflowCommand(["deep-interview", "read-compact", "--input-file"], cwd);
		expect(missingOperand.status).toBe(1);
		expect(missingOperand.stderr).toMatch(/--input-file requires a value/);

		const missingFile = await runWorkflowCommand(
			["deep-interview", "read-compact", "--input-file", "missing.json"],
			cwd,
		);
		expect(missingFile.status).toBe(1);
		expect(missingFile.stderr).toMatch(/ENOENT/);

		const nonObject = await runWorkflowCommand(["deep-interview", "read-compact", "--input-file", scalarPath], cwd);
		expect(nonObject.status).toBe(1);
		expect(nonObject.stderr).toMatch(/input must be a JSON object/);

		const combined = await runWorkflowCommand(
			["deep-interview", "read-compact", "--input", JSON.stringify({ sessionId }), "--input-file", scalarPath],
			cwd,
		);
		expect(combined.status).toBe(1);
		expect(combined.stderr).toMatch(/--input and --input-file cannot be used together/);
	});

	it("keeps workflow manifest verbs recognized by the dispatcher", async () => {
		for (const [skill, manifest] of Object.entries(PI_WORKFLOW_MANIFEST)) {
			for (const verb of manifest.verbs) {
				const result = await runWorkflowCommand(
					[skill, verb.name, "--input", JSON.stringify({ sessionId }), "--json"],
					cwd,
				);
				expect(result.stderr).not.toContain(`unsupported pi workflow ${skill} verb`);
			}
		}
	});

	it("registers model-visible workflow spawn tools through the extension", () => {
		const registeredTools: string[] = [];
		workflowsExtension({
			registerTool(tool: { name: string }) {
				registeredTools.push(tool.name);
			},
			on() {},
		} as never);

		expect(registeredTools).toEqual(
			expect.arrayContaining([
				"subagent_spawn",
				"ralplan_run_agent",
				"team_spawn_task_agent",
				"team_spawn_review_agent",
				"team_spawn_prover_agent",
				"ultragoal_spawn_goal_agent",
			]),
		);
	});

	it("keeps built agent assets synchronized with source agent assets", async () => {
		const packageRoot = fileURLToPath(new URL("..", import.meta.url));
		const sourceAgents = (await readdir(join(packageRoot, "src", "agents")))
			.filter((name) => name.endsWith(".md"))
			.sort();
		const distAgents = (await readdir(join(packageRoot, "dist", "agents")))
			.filter((name) => name.endsWith(".md"))
			.sort();

		expect(distAgents).toEqual(sourceAgents);
	});

	it("supports pi workflow state as the centralized state command", async () => {
		const written = await runWorkflowCommand(
			[
				"state",
				"ralplan",
				"write",
				"--input",
				'{"phase":"planner","active":true,"run_id":"run-2"}',
				"--session",
				sessionId,
				"--json",
			],
			cwd,
		);
		expect(written.status).toBe(0);
		const writtenJson = JSON.parse(written.stdout) as { state: { current_phase?: string; run_id?: string } };
		expect(writtenJson.state.current_phase).toBe("planner");
		expect(writtenJson.state.run_id).toBe("run-2");
	});

	it("escalates pending-question active HUD entries to blocked", async () => {
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "deep-interview",
				active: true,
				phase: "waiting_for_answer",
				has_pending_question: true,
				hud: { version: 1, severity: "info", summary: "question waiting" },
			},
			{ sessionId },
		);
		const active = await readWorkflowActiveState(cwd, { sessionId });
		expect(active?.active_workflows[0]).toMatchObject({
			skill: "deep-interview",
			has_pending_question: true,
			hud: { severity: "blocked" },
		});
	});

	it("refuses detached interactive starts in blocking question phases", async () => {
		const refused = await runWorkflowCommand([
			"start",
			"--input",
			JSON.stringify({
				workspace: cwd,
				sessionId: "h-blocking-question",
				detach: true,
				skill: "deep-interview",
				phase: "waiting_for_answer",
			}),
			"--json",
		]);
		expect(refused.status).toBe(1);
		expect(refused.stderr).toMatch(/detached workflow refused/);
	});

	it("exposes transition metadata for fail-closed harness checks", () => {
		expect(isBlockingQuestionPhaseForSkill("deep-interview", "waiting_for_answer")).toBe(true);
		expect(skillTerminalDetectors("deep-interview")).toContainEqual(
			expect.objectContaining({ id: "deep-interview-spec-artifact-present", kind: "filesystem" }),
		);
		expect(skillTerminalDetectors("ralplan")).toContainEqual(
			expect.objectContaining({ id: "ralplan-final-artifact-receipt", kind: "receipt" }),
		);
		expect(skillTerminalDetectors("team")).toContainEqual(
			expect.objectContaining({ id: "team-completion-state-or-gate", kind: "state" }),
		);
		expect(skillGateValidators("ultragoal")).toContainEqual(
			expect.objectContaining({ id: "ultragoal-guard-and-blocker-classification" }),
		);
	});

	it("supports pi workflow state handoff and active snapshot updates", async () => {
		const handoff = await runWorkflowCommand(
			["state", "deep-interview", "handoff", "--to", "ralplan", "--session", sessionId, "--json"],
			cwd,
		);
		expect(handoff.status).toBe(0);
		const handoffJson = JSON.parse(handoff.stdout) as {
			state: { active?: boolean };
			target_state: { active?: boolean };
		};
		expect(handoffJson.state.active).toBe(false);
		expect(handoffJson.target_state.active).toBe(true);

		const active = await runWorkflowCommand(["state", "active", "--session", sessionId, "--json"], cwd);
		expect(active.status).toBe(0);
		const activeJson = JSON.parse(active.stdout) as { state: { active_workflows?: Array<{ skill: string }> } };
		expect(activeJson.state.active_workflows).toEqual([
			{
				skill: "ralplan",
				active: true,
				phase: "handoff",
				session_id: sessionId,
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

	describe("expected next role", () => {
		it("refuses off-script workflow role spawns and runtime overrides", () => {
			expect(() =>
				assertExpectedNextRole(
					{ skill: "ralplan", stage: "planner", role: "planner", owner: "ralplan_run_agent", runId: "run-1" },
					{ skill: "ralplan", stage: "planner", role: "critic", owner: "ralplan_run_agent", runId: "run-1" },
				),
			).toThrow(/off-script spawn refused/);
			expect(() => assertNoGuardedSpawnOverrides({ model: "provider/model" })).toThrow(/runtime overrides/);
		});
	});

	describe("context templates", () => {
		it("builds deterministic ralplan role prompts and tasks", () => {
			const input = {
				role: "planner" as const,
				runId: "run-1",
				stage: "planner",
				stageN: 1,
				deliberate: true,
				contextArtifacts: ["b.md", "a.md"],
				task: "Draft the plan",
			};
			expect(buildRalplanRoleSystemPrompt("planner")).toBe(buildRalplanRoleSystemPrompt("planner"));
			expect(buildRalplanTaskPrompt(input)).toBe(buildRalplanTaskPrompt(input));
			expect(buildRalplanTaskPrompt(input)).toContain("Context artifacts:\n- b.md\n- a.md");
		});
	});

	describe("ralplan explorer gate", () => {
		it("blocks planner until an explorer context_map is recorded", async () => {
			const plannerInput = {
				role: "planner" as const,
				stage: "planner" as const,
				stageN: 1,
				runId: "explorer-run",
				task: "Plan implementation",
				dryRun: true,
			};
			await expect(runRalplanAgent(cwd, plannerInput, sessionId)).rejects.toThrow(/context_map/);
			await expect(runRalplanAgent(cwd, plannerInput, sessionId)).rejects.toThrow(/human_blocked/);

			const gate = await recordRalplanExplorerGateArtifact(
				cwd,
				{
					runId: "explorer-run",
					contextMap: { context_needed: false, summary: "Trivial task; bypass context." },
				},
				sessionId,
			);
			expect(gate.status).toBe("passed");

			const result = await runRalplanAgent(cwd, plannerInput, sessionId);
			expect(result.status).toBe("planned");
		});
	});

	describe("team review gate", () => {
		it("refuses completed tasks without a passing review report and escalates after retry", async () => {
			await startTeam(cwd, { task: "Implement reviewed work", teamId: "review-team" }, sessionId);
			await createTeamTask(
				cwd,
				{ teamId: "review-team", id: "task-a", title: "Task A", description: "Do task A" },
				sessionId,
			);

			const evidence = {
				summary: "Worker completed implementation and verification evidence.",
				recorded_by: "worker-1",
			};
			await expect(
				transitionTeamTask(
					cwd,
					{ teamId: "review-team", taskId: "task-a", status: "completed", evidence },
					sessionId,
				),
			).rejects.toThrow(/review_report/);
			await expect(
				transitionTeamTask(
					cwd,
					{ teamId: "review-team", taskId: "task-a", status: "completed", evidence },
					sessionId,
				),
			).rejects.toThrow(/human_blocked/);
		});

		it("escalates to human_blocked after a second blocking review report", async () => {
			await startTeam(cwd, { task: "Implement reviewed blocking work", teamId: "review-block-team" }, sessionId);
			await createTeamTask(
				cwd,
				{ teamId: "review-block-team", id: "task-c", title: "Task C", description: "Do task C" },
				sessionId,
			);
			const blocking = {
				max_severity: "high",
				needs_changes: true,
				summary: "High-severity defect blocks completion.",
			};
			const first = await recordTeamReviewGateArtifact(
				cwd,
				{ teamId: "review-block-team", taskId: "task-c", reviewReport: blocking },
				sessionId,
			);
			expect(first.status).toBe("blocked");
			const second = await recordTeamReviewGateArtifact(
				cwd,
				{ teamId: "review-block-team", taskId: "task-c", reviewReport: blocking },
				sessionId,
			);
			expect(second.status).toBe("human_blocked");
		});

		it("allows completed tasks after a non-blocking review report", async () => {
			await startTeam(cwd, { task: "Implement reviewed passing work", teamId: "review-pass-team" }, sessionId);
			await createTeamTask(
				cwd,
				{ teamId: "review-pass-team", id: "task-b", title: "Task B", description: "Do task B" },
				sessionId,
			);
			const gate = await recordTeamReviewGateArtifact(
				cwd,
				{
					teamId: "review-pass-team",
					taskId: "task-b",
					reviewReport: {
						max_severity: "medium",
						needs_changes: true,
						summary: "Medium issue recorded but non-blocking in v1.",
					},
				},
				sessionId,
			);
			expect(gate.status).toBe("passed");

			const task = await transitionTeamTask(
				cwd,
				{
					teamId: "review-pass-team",
					taskId: "task-b",
					status: "completed",
					evidence: {
						summary: "Worker completed implementation and verification evidence.",
						recorded_by: "worker-1",
					},
				},
				sessionId,
			);
			expect(task.status).toBe("completed");
		});
	});

	describe("team completion gate", () => {
		it("refuses complete without a prover evidence matrix and escalates after a bounded retry", async () => {
			const team = await startTeam(
				cwd,
				{ task: "Implement a gated team completion flow", teamId: "gate-team" },
				sessionId,
			);
			expect(team.phase).toBe("running");

			await expect(completeTeam(cwd, { teamId: "gate-team" }, sessionId)).rejects.toThrow(/evidence_matrix/);
			let state = await readWorkflowState(cwd, "team", { sessionId });
			expect(state?.current_phase).toBe("running");

			await expect(completeTeam(cwd, { teamId: "gate-team" }, sessionId)).rejects.toThrow(/human_blocked/);
			state = await readWorkflowState(cwd, "team", { sessionId });
			expect(state?.current_phase).toBe("running");
		});

		it("allows complete after a passing prover evidence matrix", async () => {
			await startTeam(cwd, { task: "Implement a verified team completion flow", teamId: "passing-team" }, sessionId);
			const gate = await recordTeamCompletionGateArtifact(
				cwd,
				{
					teamId: "passing-team",
					evidenceMatrix: {
						ship_decision: "ship",
						escalation: "none",
						summary: "Verification passed for all required team work.",
						evidence: [{ kind: "command", ref: "npm test", note: "passed" }],
					},
				},
				sessionId,
			);
			expect(gate.status).toBe("passed");

			const completed = await completeTeam(cwd, { teamId: "passing-team", summary: "verified" }, sessionId);
			expect(completed.phase).toBe("complete");
		});

		it("escalates to human_blocked after a second blocking prover evidence matrix", async () => {
			await startTeam(cwd, { task: "Implement a blocked team completion flow", teamId: "blocking-team" }, sessionId);
			const blocking = {
				ship_decision: "blocked",
				escalation: "retry",
				summary: "Evidence incomplete; cannot ship.",
			};
			const first = await recordTeamCompletionGateArtifact(
				cwd,
				{ teamId: "blocking-team", evidenceMatrix: blocking },
				sessionId,
			);
			expect(first.status).toBe("blocked");
			const second = await recordTeamCompletionGateArtifact(
				cwd,
				{ teamId: "blocking-team", evidenceMatrix: blocking },
				sessionId,
			);
			expect(second.status).toBe("human_blocked");
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

	describe("expectedNextRalplanRole selector", () => {
		it("returns explorer pre-planner until the explorer gate passes, expert-stage when human_blocked", () => {
			expect(expectedNextRalplanRole({ explorerGate: { status: "missing" } }, "r")?.stage).toBe("pre-planner");
			expect(expectedNextRalplanRole({ explorerGate: { status: "retry_requested" } }, "r")?.stage).toBe(
				"pre-planner",
			);
			expect(expectedNextRalplanRole({ explorerGate: { status: "passed" } }, "r")?.stage).toBe("planner");
			expect(expectedNextRalplanRole({ explorerGate: { status: "human_blocked" } }, "r")?.stage).toBe(
				"expert-stage",
			);
			// Explorer gate blocks every role spawn, even after a latest artifact would otherwise advance the stage.
			expect(
				expectedNextRalplanRole({ latest: { stage: "planner" }, explorerGate: { status: "missing" } }, "r")?.stage,
			).toBe("pre-planner");
		});

		it("enforces the expert escalation loop cap", () => {
			expect(
				expectedNextRalplanRole({ current_phase: "expert-stage", expertCount: 2, expertCap: 3 }, "r")?.stage,
			).toBe("expert-stage");
			expect(
				expectedNextRalplanRole({ current_phase: "expert-stage", expertCount: 3, expertCap: 3 }, "r"),
			).toBeUndefined();
			expect(
				expectedNextRalplanRole({ explorerGate: { status: "human_blocked" }, expertCount: 3, expertCap: 3 }, "r"),
			).toBeUndefined();
		});

		it("returns explorer when no artifact or explorer gate exists yet", () => {
			const expected = expectedNextRalplanRole(undefined, "run-1");
			expect(expected?.stage).toBe("pre-planner");
			expect(expected?.role).toBe("explorer");
		});

		it("returns architect after a planner artifact and after revision", () => {
			expect(
				expectedNextRalplanRole({ explorerGate: { status: "passed" }, latest: { stage: "planner" } }, "r")?.stage,
			).toBe("architect");
			expect(
				expectedNextRalplanRole({ explorerGate: { status: "passed" }, latest: { stage: "revision" } }, "r")?.stage,
			).toBe("architect");
		});

		it("always routes an architect artifact to critic", () => {
			const block = expectedNextRalplanRole(
				{
					explorerGate: { status: "passed" },
					latest: {
						stage: "architect",
						verdict: { role: "architect", clarity: "block", recommendation: "request_changes" },
					},
				},
				"r",
			);
			expect(block?.stage).toBe("critic");
			const clear = expectedNextRalplanRole(
				{
					explorerGate: { status: "passed" },
					latest: {
						stage: "architect",
						verdict: { role: "architect", clarity: "clear", recommendation: "approve" },
					},
				},
				"r",
			);
			expect(clear?.stage).toBe("critic");
		});

		it("routes critic approve to closed, iterate/reject to revision, missing verdict to critic", () => {
			expect(
				expectedNextRalplanRole(
					{
						explorerGate: { status: "passed" },
						latest: { stage: "critic", verdict: { role: "critic", verdict: "approve" } },
					},
					"r",
				),
			).toBeUndefined();
			expect(
				expectedNextRalplanRole(
					{
						explorerGate: { status: "passed" },
						latest: { stage: "critic", verdict: { role: "critic", verdict: "reject" } },
					},
					"r",
				)?.stage,
			).toBe("revision");
			expect(
				expectedNextRalplanRole({ explorerGate: { status: "passed" }, latest: { stage: "critic" } }, "r")?.stage,
			).toBe("critic");
		});

		it("returns undefined for closed phases and adr/final artifacts", () => {
			expect(expectedNextRalplanRole({ current_phase: "pending-approval" }, "r")).toBeUndefined();
			expect(expectedNextRalplanRole({ current_phase: "handoff" }, "r")).toBeUndefined();
			expect(
				expectedNextRalplanRole({ explorerGate: { status: "passed" }, latest: { stage: "final" } }, "r"),
			).toBeUndefined();
		});
	});

	describe("expectedNextTeamRole selector", () => {
		it("picks the lexicographically smallest pending task", () => {
			const expected = expectedNextTeamRole({
				team_id: "t1",
				tasks: [
					{ id: "task-b", status: "pending" },
					{ id: "task-a", status: "pending" },
				],
			});
			expect(expected?.taskId).toBe("task-a");
			expect(expected?.role).toBe("worker");
		});

		it("routes an in-progress task without a passing review gate to reviewer", () => {
			const expected = expectedNextTeamRole({
				team_id: "t1",
				tasks: [
					{ id: "task-a", status: "pending" },
					{ id: "task-z", status: "in_progress" },
				],
			});
			expect(expected?.taskId).toBe("task-z");
			expect(expected?.role).toBe("reviewer");
			expect(expected?.stage).toBe("task-review");
		});

		it("routes all completed tasks without a completion gate to prover", () => {
			const expected = expectedNextTeamRole({
				team_id: "t1",
				tasks: [
					{ id: "task-a", status: "completed" },
					{ id: "task-b", status: "completed" },
				],
			});
			expect(expected?.role).toBe("prover");
			expect(expected?.stage).toBe("team-proof");
		});

		it("returns undefined when all tasks are completed and completion gate passed", () => {
			expect(
				expectedNextTeamRole({
					team_id: "t1",
					completion_gate: { status: "passed" },
					tasks: [
						{ id: "task-a", status: "completed" },
						{ id: "task-b", status: "completed" },
					],
				}),
			).toBeUndefined();
		});

		it("returns undefined when tasks are completed/blocked/failed and no gate can advance", () => {
			expect(
				expectedNextTeamRole({
					team_id: "t1",
					tasks: [
						{ id: "task-a", status: "completed" },
						{ id: "task-b", status: "blocked" },
					],
				}),
			).toBeUndefined();
		});
	});

	describe("ralplan expected-next enforcement (E2E)", () => {
		it("drives the selector through a full verdict-branching flow", async () => {
			const sessionId = "e2e-session-id";
			await recordRalplanExplorerGateArtifact(
				cwd,
				{ runId: "run-e2e", contextMap: { context_needed: false, summary: "trivial" } },
				sessionId,
			);
			const stateFor = async () => {
				const state = await readWorkflowState(cwd, "ralplan", { sessionId });
				const status = await readRalplanStatus(cwd, sessionId, "run-e2e");
				return expectedNextRalplanRole(
					{
						current_phase: state?.current_phase as string | undefined,
						explorerGate: { status: "passed" },
						latest: status.latest
							? {
									stage: status.latest.stage,
									verdict: status.latest.verdict as RalplanSelectorVerdict | undefined,
								}
							: undefined,
					},
					"run-e2e",
				);
			};

			// No artifacts yet: legal next is planner.
			expect((await stateFor())?.stage).toBe("planner");
			await writeRalplanArtifact(
				cwd,
				{ runId: "run-e2e", stage: "planner", stageN: 1, artifact: "# Plan" },
				sessionId,
			);
			expect((await stateFor())?.stage).toBe("architect");

			// Architect always routes to critic (architect verdicts do not branch the stage flow).
			await writeRalplanArtifact(
				cwd,
				{
					runId: "run-e2e",
					stage: "architect",
					stageN: 1,
					artifact: "# Arch\nClarity: CLEAR\nRecommendation: approve",
				},
				sessionId,
			);
			expect((await stateFor())?.stage).toBe("critic");

			// Critic REJECT routes to revision; revision routes back to architect.
			await writeRalplanArtifact(
				cwd,
				{ runId: "run-e2e", stage: "critic", stageN: 1, artifact: "# Critic\nVerdict: REJECT" },
				sessionId,
			);
			expect((await stateFor())?.stage).toBe("revision");
			await writeRalplanArtifact(
				cwd,
				{ runId: "run-e2e", stage: "revision", stageN: 2, artifact: "# Revision" },
				sessionId,
			);
			expect((await stateFor())?.stage).toBe("architect");
			await writeRalplanArtifact(
				cwd,
				{
					runId: "run-e2e",
					stage: "architect",
					stageN: 2,
					artifact: "# Arch\nClarity: CLEAR\nRecommendation: approve",
				},
				sessionId,
			);
			expect((await stateFor())?.stage).toBe("critic");

			// Critic APPROVE closes the run (no legal role spawn remains).
			await writeRalplanArtifact(
				cwd,
				{ runId: "run-e2e", stage: "critic", stageN: 2, artifact: "# Critic\nVerdict: APPROVE" },
				sessionId,
			);
			expect(await stateFor()).toBeUndefined();
		});

		it("refuses an off-sequence spawn via assertExpectedNextRole", () => {
			// After a planner artifact, the legal next is architect, not critic.
			const expected = expectedNextRalplanRole(
				{ explorerGate: { status: "passed" }, latest: { stage: "planner" } },
				"r",
			);
			expect(() =>
				assertExpectedNextRole(expected!, {
					skill: "ralplan",
					stage: "critic",
					role: "critic",
					owner: "ralplan_run_agent",
				}),
			).toThrow(/off-script spawn refused.*role critic != architect/);
		});
	});

	describe("team expected-next enforcement (E2E)", () => {
		it("selects the lexicographically smallest pending task and refuses others", async () => {
			const sessionId = "e2e-team-session";
			await startTeam(cwd, { task: "Team E2E", teamId: "team-e2e" }, sessionId);
			await createTeamTask(cwd, { teamId: "team-e2e", id: "task-b", title: "B", description: "do b" }, sessionId);
			await createTeamTask(cwd, { teamId: "team-e2e", id: "task-a", title: "A", description: "do a" }, sessionId);
			const snapshot = await readTeamSnapshot(cwd, sessionId, "team-e2e");
			const expected = expectedNextTeamRole(snapshot);
			expect(expected?.taskId).toBe("task-a");
			// Spawning for task-b (not the legal next) is refused.
			expect(() =>
				assertExpectedNextRole(expected!, {
					skill: "team",
					stage: "task-worker",
					role: "worker",
					owner: "team_spawn_task_agent",
					teamId: "team-e2e",
					taskId: "task-b",
				}),
			).toThrow(/off-script spawn refused.*task task-b != task-a/);
		});
	});
});
