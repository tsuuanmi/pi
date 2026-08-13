import type { Model } from "@tsuuanmi/pi-agent";
import type {
	SubagentManagerApi,
	SubagentRecord,
	SubagentRunRequest,
	SubagentRunResult,
} from "@tsuuanmi/pi-orchestrator";
import type { WorkflowContext } from "#workflows/tool/index";

export type SpawnAction = (request: SubagentRunRequest) => void | Promise<void>;

const hostModel = {
	id: "test-model",
	name: "Test model",
	api: "openai-completions",
	provider: "test",
	baseUrl: "",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 1_000,
} satisfies Model;

export function createTeamContext(
	manager: SubagentManagerApi,
	sessionId = "test-session",
	cwd = "test",
): WorkflowContext {
	return {
		cwd,
		sessionManager: { getSessionId: () => sessionId },
		subagent: manager,
		model: hostModel,
		resolveModel: (provider, modelId) =>
			provider === hostModel.provider && modelId === hostModel.id ? hostModel : undefined,
	};
}

export function createFakeManager(action: SpawnAction): SubagentManagerApi {
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
		getActiveCount: () => 0,
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
		cwd: "test",
		status: "completed",
		resumable: false,
		created_at: now,
		updated_at: now,
	};
}
