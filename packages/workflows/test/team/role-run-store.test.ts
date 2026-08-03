import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { teamRoleRunPath } from "#workflows/session/session-layout";
import { saveRoleFailure } from "#workflows/skills/team/role-run-store";

describe("team role run persistence", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-team-role-run-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("persists a synthetic role failure", async () => {
		await saveRoleFailure(cwd, "team-1", "session-1", "run-1", "prover", "missing evidence_matrix");

		const record = JSON.parse(await readFile(teamRoleRunPath(cwd, "team-1", "session-1", "run-1"), "utf8")) as {
			team_id: string;
			run_id: string;
			role: string;
			status: string;
			error: string;
		};
		expect(record).toMatchObject({
			team_id: "team-1",
			run_id: "run-1",
			role: "prover",
			status: "failed",
			error: "missing evidence_matrix",
		});
	});
});
