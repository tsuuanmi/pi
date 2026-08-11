import type { OrchestratorCheckpointStore } from "@tsuuanmi/pi-orchestrator";
import { describe, expect, it, vi } from "vitest";
import { createTeamAgents } from "#workflows/skills/team/agent-adapter";
import { runTeamOrchestrator } from "#workflows/skills/team/orchestrator";
import type { TeamTask } from "#workflows/skills/team/types";
import { createFakeManager, createTeamContext } from "./fakes";

const task: TeamTask = {
	version: 1,
	id: "task-1",
	title: "Implement recovery",
	description: "Verify strict checkpoint persistence.",
	owner: "worker",
	assignee: "worker-1",
	status: "pending",
	depends_on: [],
	created_at: "2026-08-11T00:00:00.000Z",
	updated_at: "2026-08-11T00:00:00.000Z",
};

describe("team orchestrator recovery", () => {
	it("does not allow callers to downgrade checkpoint save failures", async () => {
		const spawn = vi.fn(() => {
			throw new Error("agent must not run after a checkpoint failure");
		});
		const agents = createTeamAgents(createTeamContext(createFakeManager(spawn)), [
			{ id: "worker-1", profile: "worker", capabilities: ["write"] },
		]);
		const checkpointStore: OrchestratorCheckpointStore = {
			load: async () => undefined,
			save: async () => {
				throw new Error("checkpoint write failed");
			},
		};

		await expect(
			runTeamOrchestrator({
				name: "recovery-team",
				agents,
				tasks: [task],
				routes: { "task-1": { capabilities: ["write"] } },
				checkpointStore,
				checkpointFailurePolicy: "best-effort",
			} as never),
		).rejects.toThrow("checkpoint write failed");
		expect(spawn).not.toHaveBeenCalled();
	});
});
