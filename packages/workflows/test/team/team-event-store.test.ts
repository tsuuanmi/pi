import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { teamEventsPath } from "#workflows/session/session-layout";
import type { TeamEvent } from "#workflows/skills/team/event-mapper";
import { saveTeamEvents } from "#workflows/skills/team/event-store";

describe("team event persistence", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-team-events-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("does not duplicate the same event on repeated persistence", async () => {
		const event: TeamEvent = {
			type: "team_task_started",
			taskId: "task-1",
			status: "in_progress",
			timestamp: "2026-08-02T00:00:00.000Z",
		};

		await saveTeamEvents(cwd, "team-1", "session-1", "run-1", [event]);
		await saveTeamEvents(cwd, "team-1", "session-1", "run-1", [{ ...event, timestamp: "2026-08-02T00:00:02.000Z" }]);
		await saveTeamEvents(cwd, "team-1", "session-1", "run-1", [{ ...event, attempt: 1 }]);

		const rows = (await readFile(teamEventsPath(cwd, "team-1", "session-1"), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { event_id: string });
		expect(rows).toHaveLength(2);
		expect(rows[0]?.event_id).toMatch(/^team-event-/);
		expect(rows[1]?.event_id).toMatch(/^team-event-/);
		expect(rows[0]?.event_id).not.toBe(rows[1]?.event_id);
	});
});
