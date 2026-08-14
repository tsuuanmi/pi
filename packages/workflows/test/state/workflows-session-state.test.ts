import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionActiveStatePath } from "@tsuuanmi/pi/session/layout";
import { readWorkflowActiveState, syncWorkflowActiveState } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("session-scoped workflow active state", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-session-state-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("writes and reads session-scoped state", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId });

		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state?.version).toBe(2);
		expect(state?.active_workflows).toHaveLength(1);
		expect(state?.active_workflows[0]?.skill).toBe("ralplan");
		expect(state?.active_workflows[0]?.phase).toBe("planner");
		expect(state?.active_workflows[0]?.session_id).toBe(sessionId);
	});

	it("session-scoped entries are hidden from other sessions", async () => {
		const sessionA = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const sessionB = "0192ffff-0000-0000-0000-000000000000";

		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId: sessionA });

		// Session B should not see session A's entries — session B has no state at all
		const stateB = await readWorkflowActiveState(cwd, { sessionId: sessionB });
		expect(stateB).toBeUndefined();
	});

	it("newer entries replace older entries for the same skill", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

		// First write: planner phase
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "ralplan",
				active: true,
				phase: "planner",
				updated_at: "2026-01-01T00:00:00.000Z",
			},
			{ sessionId },
		);
		// Second write: architect phase (newer timestamp)
		await syncWorkflowActiveState(
			cwd,
			{ skill: "ralplan", active: true, phase: "architect", updated_at: "2026-01-02T00:00:00.000Z" },
			{ sessionId },
		);

		const state = await readWorkflowActiveState(cwd, { sessionId });
		const ralplan = state?.active_workflows.find((w) => w.skill === "ralplan");
		expect(ralplan?.phase).toBe("architect");
		expect(ralplan?.session_id).toBe(sessionId);
	});

	it("session deactivation hides the skill from session read", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

		// Activate then deactivate ralplan in the same session
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "ralplan",
				active: true,
				phase: "planner",
				updated_at: "2026-01-01T00:00:00.000Z",
			},
			{ sessionId },
		);
		await syncWorkflowActiveState(
			cwd,
			{ skill: "ralplan", active: false, phase: "complete", updated_at: "2026-01-02T00:00:00.000Z" },
			{ sessionId },
		);

		// Session-scoped read: ralplan is not active
		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state?.active_workflows.find((w) => w.skill === "ralplan")).toBeUndefined();
	});

	it("merges entries for different skills within the same session", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId },
		);
		// team is outside the planning pipeline, so it is not collapsed into
		// deep-interview by the pipeline collapse on read.
		await syncWorkflowActiveState(cwd, { skill: "team", active: true, phase: "executing" }, { sessionId });

		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state?.active_workflows).toHaveLength(2);
		const skills = state?.active_workflows.map((w) => w.skill).sort();
		expect(skills).toEqual(["deep-interview", "team"]);
	});

	it("returns undefined when state file is absent", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state).toBeUndefined();
	});

	it("returns defined state with empty active_workflows when file exists but no active entries", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId });
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: false, phase: "complete" }, { sessionId });

		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state).toBeDefined();
		expect(state?.active).toBe(false);
		expect(state?.active_workflows).toHaveLength(0);
	});

	it("rejects corrupt state files", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const filePath = sessionActiveStatePath(cwd, sessionId);
		await mkdir(join(filePath, ".."), { recursive: true });
		await writeFile(filePath, "{ not valid json");

		await expect(readWorkflowActiveState(cwd, { sessionId })).rejects.toThrow("unreadable");
	});

	it("rejects unsupported active-state versions", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const filePath = sessionActiveStatePath(cwd, sessionId);
		await mkdir(join(filePath, ".."), { recursive: true });
		await writeFile(
			filePath,
			JSON.stringify({
				version: 99,
				active: true,
				updated_at: "2026-01-01T00:00:00.000Z",
				active_workflows: [{ skill: "ralplan", active: true, updated_at: "2026-01-01T00:00:00.000Z" }],
			}),
		);

		await expect(readWorkflowActiveState(cwd, { sessionId })).rejects.toThrow("version");
	});

	it("rejects missing or foreign entry session identities", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const filePath = sessionActiveStatePath(cwd, sessionId);
		await mkdir(join(filePath, ".."), { recursive: true });
		const base = { version: 2, active: true, updated_at: "2026-01-01T00:00:00.000Z" };

		await writeFile(
			filePath,
			JSON.stringify({
				...base,
				active_workflows: [{ skill: "ralplan", active: true, updated_at: base.updated_at }],
			}),
		);
		await expect(readWorkflowActiveState(cwd, { sessionId })).rejects.toThrow("requires session_id");

		await writeFile(
			filePath,
			JSON.stringify({
				...base,
				active_workflows: [
					{ skill: "ralplan", active: true, updated_at: base.updated_at, session_id: "other-session" },
				],
			}),
		);
		await expect(readWorkflowActiveState(cwd, { sessionId })).rejects.toThrow("session mismatch");
	});

	it("supports multiple sessions with independent state", async () => {
		const sessionA = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const sessionB = "0192ffff-0000-0000-0000-000000000000";

		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId: sessionA });
		await syncWorkflowActiveState(cwd, { skill: "team", active: true, phase: "running" }, { sessionId: sessionB });

		const stateA = await readWorkflowActiveState(cwd, { sessionId: sessionA });
		expect(stateA?.active_workflows).toHaveLength(1);
		expect(stateA?.active_workflows[0]?.skill).toBe("ralplan");

		const stateB = await readWorkflowActiveState(cwd, { sessionId: sessionB });
		expect(stateB?.active_workflows).toHaveLength(1);
		expect(stateB?.active_workflows[0]?.skill).toBe("team");
	});
});
