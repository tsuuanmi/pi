import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWorkflowCommand } from "#workflows/commands/workflow";

const sessionId = "legacy-session";

describe("pi workflow migrate", () => {
	let cwd: string;
	let root: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-layout-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		root = join(cwd, ".pi", sessionId);
		await mkdir(join(root, "workflows", "ralplan", "agents"), { recursive: true });
		await mkdir(join(root, "plans", "ralplan", "run-1"), { recursive: true });
		await mkdir(join(root, "specs"), { recursive: true });
		await mkdir(join(root, "ultragoal"), { recursive: true });
		await mkdir(join(root, "team", "team-1"), { recursive: true });
		await mkdir(join(root, "workflows", "ultragoal"), { recursive: true });
		await mkdir(join(root, "workflows", "team"), { recursive: true });
		await writeFile(join(root, "workflows", "active-state.json"), "{}\n");
		await writeFile(join(root, "workflows", "ralplan", "state.json"), "{}\n");
		await writeFile(join(root, "workflows", "ultragoal", "state.json"), "{}\n");
		await writeFile(join(root, "workflows", "team", "state.json"), "{}\n");
		await writeFile(join(root, "ultragoal", "goals.json"), "[]\n");
		await writeFile(join(root, "team", "team-1", "config.json"), "{}\n");
		await writeFile(join(root, "plans", "ralplan", "run-1", "pending-approval.md"), "# Plan\n");
		await writeFile(join(root, "specs", "deep-interview-example.md"), "# Spec\n");
		await writeFile(join(root, "api-usage.jsonl"), "{}\n");
		await writeFile(
			join(root, "workflows", "ralplan", "agents", "ralagent-1.json"),
			JSON.stringify({
				agent_run_id: "ralagent-1",
				planner_subagent_id: "subagent-1",
				role: "planner",
				run_id: "run-1",
				stage: "planner",
				stage_n: 1,
				status: "completed",
				output: "legacy duplicate",
			}),
		);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("previews without changing files", async () => {
		const result = await runWorkflowCommand(
			["migrate", "--dry-run", "--json", "--input", JSON.stringify({ sessionId })],
			cwd,
		);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout).status).toBe("would-migrate");
		expect(await readFile(join(root, "workflows", "active-state.json"), "utf8")).toBe("{}\n");
	});

	it("moves legacy paths and rewrites workflow execution records", async () => {
		const result = await runWorkflowCommand(["migrate", "--json", "--input", JSON.stringify({ sessionId })], cwd);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout).status).toBe("migrated");
		expect(await readFile(join(root, "skills", "active-state.json"), "utf8")).toBe("{}\n");
		expect(await readFile(join(root, "skills", "ralplan", "state.json"), "utf8")).toBe("{}\n");
		expect(await readFile(join(root, "skills", "ultragoal", "state.json"), "utf8")).toBe("{}\n");
		expect(await readFile(join(root, "skills", "ultragoal", "goals.json"), "utf8")).toBe("[]\n");
		expect(await readFile(join(root, "skills", "team", "state.json"), "utf8")).toBe("{}\n");
		expect(await readFile(join(root, "skills", "team", "team-1", "config.json"), "utf8")).toBe("{}\n");
		expect(await readFile(join(root, "artifacts", "plans", "ralplan", "run-1", "pending-approval.md"), "utf8")).toBe(
			"# Plan\n",
		);
		expect(await readFile(join(root, "artifacts", "specs", "deep-interview-example.md"), "utf8")).toBe("# Spec\n");
		expect(await readFile(join(root, "state", "api-usage.jsonl"), "utf8")).toBe("{}\n");
		expect(
			JSON.parse(await readFile(join(root, "skills", "ralplan", "executions", "subagent-1.json"), "utf8")),
		).toEqual({
			subagent_id: "subagent-1",
			role: "planner",
			run_id: "run-1",
			stage: "planner",
			stage_n: 1,
			validation: { artifact: "valid" },
		});

		const second = await runWorkflowCommand(["migrate", "--json", "--input", JSON.stringify({ sessionId })], cwd);
		expect(JSON.parse(second.stdout).status).toBe("up-to-date");
	});

	it("fails before changing files when a destination already exists", async () => {
		await mkdir(join(root, "skills"), { recursive: true });
		await writeFile(join(root, "skills", "active-state.json"), "canonical\n");
		const result = await runWorkflowCommand(["migrate", "--input", JSON.stringify({ sessionId })], cwd);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("destination already exists");
		expect(await readFile(join(root, "workflows", "active-state.json"), "utf8")).toBe("{}\n");
	});

	it("rejects duplicate canonical execution identities before changing files", async () => {
		const source = join(root, "workflows", "ralplan", "agents");
		const duplicate = JSON.parse(await readFile(join(source, "ralagent-1.json"), "utf8")) as Record<string, unknown>;
		await writeFile(join(source, "ralagent-2.json"), JSON.stringify({ ...duplicate, agent_run_id: "ralagent-2" }));
		const result = await runWorkflowCommand(["migrate", "--input", JSON.stringify({ sessionId })], cwd);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("duplicate ralplan subagent record");
		expect(await readFile(join(root, "workflows", "active-state.json"), "utf8")).toBe("{}\n");
	});

	it("rejects unsupported execution content before changing files", async () => {
		await writeFile(join(root, "workflows", "ralplan", "agents", "notes.txt"), "not an execution record\n");
		const result = await runWorkflowCommand(["migrate", "--input", JSON.stringify({ sessionId })], cwd);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("unsupported ralplan agent record");
		expect(await readFile(join(root, "workflows", "active-state.json"), "utf8")).toBe("{}\n");
	});

	it("rejects overlapping legacy sources before changing files", async () => {
		await writeFile(join(root, "ultragoal", "state.json"), "conflicting legacy state\n");
		const result = await runWorkflowCommand(["migrate", "--input", JSON.stringify({ sessionId })], cwd);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("migration destination conflict");
		expect(await readFile(join(root, "workflows", "ultragoal", "state.json"), "utf8")).toBe("{}\n");
		expect(await readFile(join(root, "ultragoal", "state.json"), "utf8")).toBe("conflicting legacy state\n");
	});

	it("rolls back completed moves when the audit receipt fails", async () => {
		await mkdir(join(root, "artifacts"), { recursive: true });
		await mkdir(join(root, "state", "audit.jsonl"), { recursive: true });
		const result = await runWorkflowCommand(["migrate", "--input", JSON.stringify({ sessionId })], cwd);
		expect(result.status).toBe(1);
		expect(await readFile(join(root, "workflows", "active-state.json"), "utf8")).toBe("{}\n");
		expect(await readFile(join(root, "ultragoal", "goals.json"), "utf8")).toBe("[]\n");
		expect(await readdir(join(root, "artifacts"))).toEqual([]);
		await expect(readFile(join(root, "skills", "active-state.json"), "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
