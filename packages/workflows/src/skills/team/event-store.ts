import { teamEventsPath } from "#workflows/session/session-layout";
import type { TeamWorkflowEvent } from "#workflows/skills/team/event-mapper";
import { appendJsonlIdempotent, nowIso, sha256 } from "#workflows/state/state-writer";

export async function saveTeamWorkflowEvents(
	cwd: string,
	teamId: string,
	sessionId: string,
	runId: string,
	events: readonly TeamWorkflowEvent[],
): Promise<void> {
	for (const event of events) {
		const eventId = createEventId(teamId, runId, event);
		await appendJsonlIdempotent(
			teamEventsPath(cwd, teamId, sessionId),
			{
				event_id: eventId,
				run_id: runId,
				team_id: teamId,
				...event,
				stored_at: nowIso(),
			},
			{
				cwd,
				key: (row) => (isRecord(row) && typeof row.event_id === "string" ? row.event_id : undefined),
			},
		);
	}
}

function createEventId(teamId: string, runId: string, event: TeamWorkflowEvent): string {
	const identity = JSON.stringify({ teamId, runId, event }, (key, value) => (key === "timestamp" ? undefined : value));
	return `team-event-${sha256(identity).slice(0, 32)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
