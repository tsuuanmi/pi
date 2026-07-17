import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	clearWorkflowState,
	getWorkflowManifest,
	isKnownWorkflowPhase,
	isWorkflowSkill,
	PI_WORKFLOW_SKILLS,
	replaceWorkflowState,
	type WorkflowSkill,
	workflowStatePath,
	writeWorkflowState,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWorkflowCommand } from "../../../src/commands/workflow.ts";

const sessionId = "test-session-id";

const SKILLS: WorkflowSkill[] = ["deep-interview", "ralplan", "team", "ultragoal"];

async function seedState(cwd: string, skill: WorkflowSkill, state: Record<string, unknown>): Promise<void> {
	const path = workflowStatePath(cwd, skill, sessionId);
	await mkdir(join(path, ".."), { recursive: true });
	await writeFile(
		path,
		`${JSON.stringify({ skill, version: 1, active: true, updated_at: new Date().toISOString(), ...state }, null, 2)}\n`,
	);
}

describe("workflow manifest state validation", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-workflow-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("defines manifest coverage for all workflow skills", () => {
		expect([...PI_WORKFLOW_SKILLS].sort()).toEqual([...SKILLS].sort());
		for (const skill of SKILLS) {
			const manifest = getWorkflowManifest(skill);
			expect(isWorkflowSkill(skill)).toBe(true);
			expect(manifest.states).toContain(manifest.initialState);
			expect(manifest.terminalStates.length).toBeGreaterThan(0);
			expect(manifest.verbs.length).toBeGreaterThan(0);
			expect(manifest.retention.length).toBeGreaterThan(0);
			expect(manifest.hudFields.length).toBeGreaterThan(0);
		}
		expect(isKnownWorkflowPhase("ultragoal", "approved-execution")).toBe(true);
		expect(isKnownWorkflowPhase("ralplan", "pending-approval")).toBe(true);
		expect(isKnownWorkflowPhase("team", "awaiting_integration")).toBe(true);
		expect(getWorkflowManifest("ralplan").transitions.some((row) => row.compatibility === true)).toBe(true);
	});

	it("defaults new and missing phases to the manifest initial phase", async () => {
		const fresh = await writeWorkflowState(cwd, "ralplan", { run_id: "r1" }, "pi workflow state write", {
			sessionId,
		});
		expect(fresh.current_phase).toBe("planner");

		await seedState(cwd, "team", { team_id: "legacy" });
		const repaired = await writeWorkflowState(cwd, "team", { task_counts: {} }, "pi workflow state write", {
			sessionId,
		});
		expect(repaired.current_phase).toBe("approved-execution");
	});

	it("rejects unknown prior preservation but allows explicit known repair", async () => {
		await seedState(cwd, "ralplan", { current_phase: "active", run_id: "r1" });
		await expect(
			writeWorkflowState(cwd, "ralplan", { run_id: "r2" }, "pi workflow state write", { sessionId }),
		).rejects.toThrow(/unknown prior phase requires explicit known repair phase/);
		const repaired = await writeWorkflowState(
			cwd,
			"ralplan",
			{ current_phase: "planner", run_id: "r2" },
			"pi workflow state write",
			{ sessionId },
		);
		expect(repaired.current_phase).toBe("planner");

		await seedState(cwd, "ralplan", { current_phase: "plannner", run_id: "r3" });
		await expect(
			writeWorkflowState(cwd, "ralplan", { current_phase: "plannner" }, "pi workflow state write", { sessionId }),
		).rejects.toThrow(/unknown next phase/);
	});

	it("accepts only operation-aware known transitions", async () => {
		await writeWorkflowState(cwd, "ralplan", { current_phase: "planner", run_id: "r1" }, "pi workflow state write", {
			sessionId,
		});
		await writeWorkflowState(cwd, "ralplan", { current_phase: "architect" }, "pi workflow state write", {
			sessionId,
		});
		await writeWorkflowState(cwd, "ralplan", { current_phase: "critic" }, "pi workflow state write", { sessionId });
		const pending = await writeWorkflowState(
			cwd,
			"ralplan",
			{ current_phase: "pending-approval" },
			"pi workflow state write",
			{ sessionId },
		);
		expect(pending.current_phase).toBe("pending-approval");
		await expect(
			writeWorkflowState(cwd, "ralplan", { current_phase: "planner" }, "pi workflow state write", { sessionId }),
		).rejects.toThrow(/transition is not allowed/);
	});

	it("distinguishes generic write from runtime-sync operation", async () => {
		await writeWorkflowState(cwd, "ultragoal", { current_phase: "approved-execution" }, "pi workflow state write", {
			sessionId,
		});
		await writeWorkflowState(cwd, "ultragoal", { current_phase: "pending" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		await writeWorkflowState(cwd, "ultragoal", { current_phase: "active" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		await expect(
			writeWorkflowState(cwd, "ultragoal", { current_phase: "pending" }, "pi workflow state write", { sessionId }),
		).rejects.toThrow(/transition is not allowed/);
		const projected = await writeWorkflowState(cwd, "ultragoal", { current_phase: "pending" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		expect(projected.current_phase).toBe("pending");
	});

	it("validates replace against prior state instead of resetting history", async () => {
		await writeWorkflowState(cwd, "team", { current_phase: "approved-execution" }, "pi workflow state write", {
			sessionId,
		});
		await writeWorkflowState(cwd, "team", { current_phase: "running" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		await clearWorkflowState(cwd, "team", {}, { sessionId });
		await expect(
			replaceWorkflowState(cwd, "team", { team_id: "new" }, "pi workflow state replace", { sessionId }),
		).rejects.toThrow(/transition is not allowed/);
		const replaced = await replaceWorkflowState(
			cwd,
			"team",
			{ current_phase: "running", team_id: "new" },
			"pi workflow state replace",
			{ sessionId },
		);
		expect(replaced.current_phase).toBe("running");
	});

	it("clear writes only the manifest clear target", async () => {
		await writeWorkflowState(cwd, "deep-interview", { current_phase: "interviewing" }, "pi workflow state write", {
			sessionId,
		});
		const cleared = await clearWorkflowState(cwd, "deep-interview", { current_phase: "handoff" }, { sessionId });
		expect(cleared.active).toBe(false);
		expect(cleared.current_phase).toBe("complete");

		await seedState(cwd, "team", { current_phase: "unknown_legacy" });
		const repaired = await clearWorkflowState(cwd, "team", {}, { sessionId });
		expect(repaired.active).toBe(false);
		expect(repaired.current_phase).toBe("complete");
	});

	it("keeps force internal and writer-generated", async () => {
		await writeWorkflowState(cwd, "ralplan", { current_phase: "planner" }, "pi workflow state write", { sessionId });
		await expect(
			writeWorkflowState(
				cwd,
				"ralplan",
				{ current_phase: "rejected", receipt: { forced: true } },
				"pi workflow state write",
				{ sessionId },
			),
		).rejects.toThrow(/transition is not allowed/);
		const forced = await writeWorkflowState(cwd, "ralplan", { current_phase: "rejected" }, "force repair", {
			force: true,
			operation: "force-repair",
			sessionId,
		});
		expect(forced.current_phase).toBe("rejected");
		expect(forced.receipt).toMatchObject({ forced: true, operation: "force-repair" });
	});

	it("rejects skill mismatch before coercion hides it", async () => {
		await expect(
			writeWorkflowState(cwd, "ralplan", { skill: "team", current_phase: "planner" }, "pi workflow state write", {
				sessionId,
			}),
		).rejects.toThrow(/skill mismatch/);
	});

	it("rejects typo phases through the CLI state command", async () => {
		const result = await runWorkflowCommand(
			["state", "ralplan", "write", "--input", '{"phase":"plannner"}', "--session", sessionId, "--json"],
			cwd,
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("unknown next phase");
	});

	it("preserves generic handoff receive compatibility", async () => {
		const result = await runWorkflowCommand(
			["state", "deep-interview", "handoff", "--to", "ralplan", "--session", sessionId, "--json"],
			cwd,
		);
		expect(result.status).toBe(0);
		const json = JSON.parse(result.stdout) as {
			state: { current_phase: string };
			target_state: { current_phase: string };
		};
		expect(json.state.current_phase).toBe("handoff");
		expect(json.target_state.current_phase).toBe("handoff");
	});

	it("allows documented reinitialization flows after terminal states", async () => {
		await writeWorkflowState(cwd, "ralplan", { current_phase: "planner" }, "pi workflow state write", { sessionId });
		await writeWorkflowState(cwd, "ralplan", { current_phase: "architect" }, "pi workflow state write", {
			sessionId,
		});
		await writeWorkflowState(cwd, "ralplan", { current_phase: "critic" }, "pi workflow state write", { sessionId });
		await writeWorkflowState(cwd, "ralplan", { current_phase: "pending-approval" }, "pi workflow state write", {
			sessionId,
		});
		await writeWorkflowState(cwd, "ralplan", { current_phase: "handoff" }, "handoff", {
			operation: "handoff-send",
			sessionId,
		});
		const newPlan = await writeWorkflowState(
			cwd,
			"ralplan",
			{ current_phase: "planner", run_id: "next" },
			"pi workflow state write",
			{ sessionId },
		);
		expect(newPlan.current_phase).toBe("planner");

		await writeWorkflowState(cwd, "ultragoal", { current_phase: "approved-execution" }, "pi workflow state write", {
			sessionId,
		});
		await writeWorkflowState(cwd, "ultragoal", { current_phase: "pending" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		await writeWorkflowState(cwd, "ultragoal", { current_phase: "active" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		await writeWorkflowState(cwd, "ultragoal", { current_phase: "complete" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		const newGoals = await writeWorkflowState(cwd, "ultragoal", { current_phase: "pending" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		expect(newGoals.current_phase).toBe("pending");

		await writeWorkflowState(cwd, "team", { current_phase: "approved-execution" }, "pi workflow state write", {
			sessionId,
		});
		await writeWorkflowState(cwd, "team", { current_phase: "running" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		await writeWorkflowState(cwd, "team", { current_phase: "complete" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		const newTeam = await writeWorkflowState(cwd, "team", { current_phase: "running" }, "runtime sync", {
			operation: "runtime-sync",
			sessionId,
		});
		expect(newTeam.current_phase).toBe("running");
	});
});
