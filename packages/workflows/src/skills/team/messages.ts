import { teamMailboxPath } from "#workflows/session/session-layout";
import { assertSafeId } from "#workflows/skills/team/ids";
import { appendTeamEvent, resolveTeamId } from "#workflows/skills/team/store";
import { appendJsonl, nowIso, sha256 } from "#workflows/state/state-writer";

export async function sendTeamMessage(
	cwd: string,
	input: { teamId?: string; from: string; to: string; body: string; idempotencyKey?: string },
	sessionId: string,
): Promise<Record<string, unknown>> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	assertSafeId("worker_id", input.from);
	assertSafeId("worker_id", input.to);
	const body = input.body.trim();
	if (!body) throw new Error("message body is required");
	const message = {
		message_id: `msg-${sha256([teamId, input.from, input.to, input.idempotencyKey ?? body].join(":"))}`,
		from_worker: input.from,
		to_worker: input.to,
		body,
		created_at: nowIso(),
		idempotency_key: input.idempotencyKey,
	};
	await appendJsonl(teamMailboxPath(cwd, teamId, input.to, sessionId), message, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "message_sent",
			worker: input.from,
			message: message.message_id,
			data: { to_worker: input.to },
		},
		sessionId,
	);
	return message;
}
