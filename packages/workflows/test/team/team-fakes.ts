import type { SubagentManager, SubagentRecord, SubagentRunRequest, SubagentRunResult } from "@tsuuanmi/pi-agent";

export type SpawnAction = (request: SubagentRunRequest) => void | Promise<void>;

export function createFakeManager(action: SpawnAction): SubagentManager {
	const unavailable = async (): Promise<never> => {
		throw new Error("fake subagent operation is not configured");
	};
	return {
		spawn: async (request): Promise<SubagentRunResult> => {
			await action(request);
			return {
				record: fakeRecord(request),
				messages: [],
				output: "completed",
			};
		},
		resume: unavailable,
		steer: unavailable,
		pause: unavailable,
		cancel: unavailable,
		read: unavailable,
		list: unavailable,
		waitFor: unavailable,
		inspect: unavailable,
		attach: unavailable,
		kill: unavailable,
		dispose: unavailable,
	};
}

function fakeRecord(request: SubagentRunRequest): SubagentRecord {
	const role = request.role;
	if (!role) throw new Error("fake subagent request requires a role");
	const now = "2026-08-02T00:00:00.000Z";
	return {
		id: `fake-${role}`,
		role,
		status: "completed",
		cwd: "test",
		resumable: false,
		created_at: now,
		updated_at: now,
	};
}
