import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncWorkflowActiveState } from "#workflows/state/active-state";
import { readWorkflowHudEntries } from "#workflows/state/hud";

describe("workflow HUD provider", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-workflow-hud-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("maps active workflow entries to status-line entries", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId });

		expect(await readWorkflowHudEntries({ cwd, sessionId })).toEqual([
			expect.objectContaining({ id: "ralplan", active: true, phase: "planner" }),
		]);
	});
});
