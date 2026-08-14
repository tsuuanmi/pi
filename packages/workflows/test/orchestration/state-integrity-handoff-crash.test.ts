import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionTransactionPath } from "@tsuuanmi/pi/session/layout";
import {
	beginWorkflowTransactionJournal,
	handoffWorkflow,
	updateWorkflowTransactionJournal,
	type WorkflowTransactionJournal,
	writeWorkflowState,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

const ENV_VAR = "PI_WORKFLOW_HANDOFF_FAIL_AFTER_CALLER";

describe("state-integrity handoff crash-injection (STATE-006)", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-handoff-crash-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		delete process.env[ENV_VAR];
		await rm(cwd, { recursive: true, force: true });
	});

	it("rejects unsupported journal versions", async () => {
		const mutationId = "legacy-journal-test";
		const filePath = sessionTransactionPath(cwd, sessionId, mutationId);
		await mkdir(join(filePath, ".."), { recursive: true });
		await writeFile(filePath, JSON.stringify({ version: 99, session_id: sessionId }));

		await expect(
			beginWorkflowTransactionJournal({
				cwd,
				sessionId,
				mutationId,
				caller: { skill: "deep-interview", phase: "handoff" },
				callee: { skill: "ralplan", phase: "planner" },
				paths: [],
				stepNames: [],
			}),
		).rejects.toThrow("version");
		await expect(updateWorkflowTransactionJournal(cwd, sessionId, mutationId, "active-state")).rejects.toThrow(
			"version",
		);
	});

	it("throws after the caller write and leaves a pending journal with callee/caller done and active-state pending", async () => {
		await writeWorkflowState(cwd, "deep-interview", { active: true, current_phase: "interviewing" }, "pi test", {
			sessionId,
		});
		const mutationId = "deep-interview:handoff:ralplan:crash-test";
		process.env[ENV_VAR] = mutationId;

		await expect(
			handoffWorkflow({
				cwd,
				caller: { skill: "deep-interview", patch: { spec_slug: "s", spec_path: "/spec.md", spec_sha256: "abc" } },
				callee: { skill: "ralplan", patch: { run_id: "run-1", input: "/spec.md" } },
				command: "pi deep-interview write-spec",
				mutationId,
				sessionId,
			}),
		).rejects.toThrow(new RegExp(`injected handoff failure after caller write for ${mutationId}`));

		// A pending journal remains (orphan — repair deferred to STATE-007).
		const raw = await readFile(sessionTransactionPath(cwd, sessionId, mutationId), "utf8");
		const journal = JSON.parse(raw) as WorkflowTransactionJournal;
		expect(journal.version).toBe(2);
		expect(journal.session_id).toBe(sessionId);
		expect(journal.mutation_id).toBe(mutationId);
		expect(journal.status).toBe("pending");
		expect(typeof journal.created_at).toBe("string");
		expect(typeof journal.updated_at).toBe("string");
		expect(journal.caller.skill).toBe("deep-interview");
		expect(journal.caller.phase).toBe("handoff");
		expect("sessionId" in journal.caller).toBe(false);
		expect(journal.callee.skill).toBe("ralplan");
		expect(journal.callee.phase).toBe("planner");
		expect("sessionId" in journal.callee).toBe(false);
		expect(journal.paths).toHaveLength(3);

		// Exact partial-step state: callee done, caller done, active-state pending.
		const byStep = new Map(journal.steps.map((s) => [s.step, s]));
		expect(byStep.get("callee-mode-state")?.status).toBe("done");
		expect(typeof byStep.get("callee-mode-state")?.at).toBe("string");
		expect(byStep.get("caller-mode-state")?.status).toBe("done");
		expect(typeof byStep.get("caller-mode-state")?.at).toBe("string");
		expect(byStep.get("active-state")?.status).toBe("pending");
		expect(byStep.get("active-state")?.at).toBeUndefined();
	});
});
