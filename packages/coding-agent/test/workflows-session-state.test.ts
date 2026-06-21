import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readWorkflowActiveState, syncWorkflowActiveState } from "../src/workflows/shared/active-state.ts";
import { workflowActiveStatePath } from "../src/workflows/shared/paths.ts";

describe("session-scoped workflow active state", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-session-state-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("writes global state when no sessionId is provided", async () => {
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" });

		const state = await readWorkflowActiveState(cwd);
		expect(state?.active_workflows).toHaveLength(1);
		expect(state?.active_workflows[0]?.skill).toBe("ralplan");
		expect(state?.active_workflows[0]?.phase).toBe("planner");
		expect(state?.active_workflows[0]?.session_id).toBeUndefined();
	});

	it("tags entries with session_id when sessionId is provided", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId });

		// Session-scoped read sees the entry
		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state?.active_workflows).toHaveLength(1);
		expect(state?.active_workflows[0]?.skill).toBe("ralplan");
		expect(state?.active_workflows[0]?.session_id).toBe(sessionId);
	});

	it("session-scoped entries are hidden from other sessions", async () => {
		const sessionA = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const sessionB = "0192ffff-0000-0000-0000-000000000000";

		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId: sessionA });

		// Session B should not see session A's entries
		const stateB = await readWorkflowActiveState(cwd, { sessionId: sessionB });
		expect(stateB?.active_workflows).toHaveLength(0);
		expect(stateB?.active).toBe(false);
	});

	it("global entries are visible to all sessions as fallback", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

		// Write global entry (no session)
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" });

		// Session-scoped read sees the global entry
		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state?.active_workflows).toHaveLength(1);
		expect(state?.active_workflows[0]?.skill).toBe("ralplan");
		expect(state?.active_workflows[0]?.session_id).toBeUndefined();
	});

	it("session entry overrides global entry for the same skill", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

		// Global: ralplan in planner phase (earlier timestamp)
		await syncWorkflowActiveState(cwd, {
			skill: "ralplan",
			active: true,
			phase: "planner",
			updated_at: "2026-01-01T00:00:00.000Z",
		});
		// Session: ralplan in architect phase (later timestamp)
		await syncWorkflowActiveState(
			cwd,
			{ skill: "ralplan", active: true, phase: "architect", updated_at: "2026-01-02T00:00:00.000Z" },
			{ sessionId },
		);

		// Session-scoped read shows session's phase (outranks global)
		const state = await readWorkflowActiveState(cwd, { sessionId });
		const ralplan = state?.active_workflows.find((w) => w.skill === "ralplan");
		expect(ralplan?.phase).toBe("architect");
		expect(ralplan?.session_id).toBe(sessionId);

		// Global read (no sessionId): all entries are visible with equal rank.
		// The session entry is newer, so it wins the dedupe.
		const globalState = await readWorkflowActiveState(cwd);
		const globalRalplan = globalState?.active_workflows.find((w) => w.skill === "ralplan");
		expect(globalRalplan?.phase).toBe("architect");
	});

	it("session deactivation overrides global activation for the same skill", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

		// Global: ralplan active (earlier timestamp)
		await syncWorkflowActiveState(cwd, {
			skill: "ralplan",
			active: true,
			phase: "planner",
			updated_at: "2026-01-01T00:00:00.000Z",
		});
		// Session: ralplan deactivated (later timestamp)
		await syncWorkflowActiveState(
			cwd,
			{ skill: "ralplan", active: false, phase: "complete", updated_at: "2026-01-02T00:00:00.000Z" },
			{ sessionId },
		);

		// Session-scoped read: ralplan is not active (session entry outranks global by ownership)
		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state?.active_workflows.find((w) => w.skill === "ralplan")).toBeUndefined();

		// Global read (no sessionId): the session deactivation has a newer timestamp,
		// so ralplan is inactive globally too (most recent entry wins).
		const globalState = await readWorkflowActiveState(cwd);
		expect(globalState?.active_workflows.find((w) => w.skill === "ralplan")).toBeUndefined();

		// A different session does not see the deactivation (foreign-session rows are hidden,
		// only the global active entry is visible as fallback)
		const otherSession = "0192ffff-0000-0000-0000-000000000000";
		const otherState = await readWorkflowActiveState(cwd, { sessionId: otherSession });
		expect(otherState?.active_workflows.find((w) => w.skill === "ralplan")).toBeDefined();
		expect(otherState?.active_workflows[0]?.active).toBe(true);
	});

	it("merges global and session entries for different skills", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

		await syncWorkflowActiveState(cwd, { skill: "deep-interview", active: true, phase: "interviewing" });
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId });

		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state?.active_workflows).toHaveLength(2);
		const skills = state?.active_workflows.map((w) => w.skill).sort();
		expect(skills).toEqual(["deep-interview", "ralplan"]);
	});

	it("returns undefined when state file is absent", async () => {
		const state = await readWorkflowActiveState(cwd);
		expect(state).toBeUndefined();
	});

	it("returns defined state with empty active_workflows when file exists but no active entries", async () => {
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" });
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: false, phase: "complete" });

		const state = await readWorkflowActiveState(cwd);
		expect(state).toBeDefined();
		expect(state?.active).toBe(false);
		expect(state?.active_workflows).toHaveLength(0);
	});

	it("tolerates corrupt state file without throwing", async () => {
		const filePath = workflowActiveStatePath(cwd);
		await mkdir(join(filePath, ".."), { recursive: true });
		await writeFile(filePath, "{ not valid json");

		const state = await readWorkflowActiveState(cwd);
		// Corrupt file is tolerated — returns defined state with no entries
		expect(state).toBeDefined();
		expect(state?.active_workflows).toHaveLength(0);
	});

	it("supports multiple sessions with independent state in a single file", async () => {
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

		// Global read (no sessionId) sees all entries — the root file is the aggregate view
		const globalState = await readWorkflowActiveState(cwd);
		expect(globalState?.active_workflows).toHaveLength(2);
	});
});
