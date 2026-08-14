import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { teamReceiptsPath } from "#workflows/skills/team/paths";
import { mapTaskReceipt, type TeamTaskReceiptRef } from "#workflows/skills/team/receipt-mapper";
import { saveTeamReceipts } from "#workflows/skills/team/receipt-store";

describe("team receipt persistence", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-team-receipts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("persists synthetic role receipts idempotently", async () => {
		const receipt: TeamTaskReceiptRef = mapTaskReceipt({
			receiptId: "receipt-1",
			runId: "run-1",
			taskId: "team-1-prover-run-1",
			taskTitle: "Prove team completion",
			status: "completed",
			attempts: 1,
			startedAt: "2026-08-02T00:00:00.000Z",
			completedAt: "2026-08-02T00:00:01.000Z",
			durationMs: 1000,
			retryCount: 0,
		});

		await saveTeamReceipts(cwd, "team-1", "session-1", "run-1", "prover", [receipt]);
		await saveTeamReceipts(cwd, "team-1", "session-1", "run-1", "prover", [receipt]);

		const rows = (await readFile(teamReceiptsPath(cwd, "team-1", "session-1"), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { id: string; role: string; task_id: string });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: "receipt-1", role: "prover", task_id: "team-1-prover-run-1" });
	});
});
