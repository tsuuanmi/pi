import { teamReceiptsPath } from "#workflows/session/session-layout";
import type { TeamTaskReceiptRef } from "#workflows/skills/team/receipt-mapper";
import { appendJsonlIdempotent, nowIso } from "#workflows/state/state-writer";

export async function saveTeamReceipts(
	cwd: string,
	teamId: string,
	sessionId: string,
	runId: string,
	role: string,
	receipts: readonly TeamTaskReceiptRef[],
): Promise<void> {
	for (const receipt of receipts) {
		await appendJsonlIdempotent(
			teamReceiptsPath(cwd, teamId, sessionId),
			{
				...receipt,
				team_id: teamId,
				run_id: runId,
				role,
				stored_at: nowIso(),
			},
			{
				cwd,
				key: (row) =>
					isRecord(row) && typeof row.id === "string" && typeof row.run_id === "string"
						? `${row.run_id}:${row.id}`
						: undefined,
			},
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
