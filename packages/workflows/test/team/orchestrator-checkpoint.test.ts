import type { OrchestratorCheckpoint } from "@tsuuanmi/pi-orchestrator";
import { describe, expect, it } from "vitest";
import { createTeamCheckpointStore, TeamCheckpointStore } from "#workflows/skills/team/orchestrator-checkpoint";

const checkpoint: OrchestratorCheckpoint = {
	version: 6,
	status: "running",
	runIdentity: { runId: "run-1" },
	runFacts: {
		teamName: "team",
		agentNames: ["worker"],
		taskIds: ["task-1"],
		startedAt: "2026-01-01T00:00:00.000Z",
	},
	tasks: {
		version: 1,
		tasks: [],
		pending: [],
		inProgress: [],
		completed: [],
		failed: [],
		blocked: [],
		skipped: [],
	},
	metrics: {},
	receipts: {},
	resume: { resumed: false },
	taskStarts: 0,
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("team checkpoint store", () => {
	it("returns undefined when no checkpoint is stored", async () => {
		const store = createTeamCheckpointStore({ read: () => undefined, write: () => undefined });

		await expect(store.load()).resolves.toBeUndefined();
	});

	it("loads valid checkpoint JSON without normalizing it", async () => {
		const store = new TeamCheckpointStore({ read: () => JSON.stringify(checkpoint), write: () => undefined });

		await expect(store.load()).resolves.toEqual(checkpoint);
	});

	it("rejects empty checkpoint text", async () => {
		const store = new TeamCheckpointStore({ read: () => "  ", write: () => undefined });

		await expect(store.load()).rejects.toThrow("Team orchestrator checkpoint is empty.");
	});

	it("rejects invalid checkpoint JSON", async () => {
		const store = new TeamCheckpointStore({ read: () => "{", write: () => undefined });

		await expect(store.load()).rejects.toThrow("Team orchestrator checkpoint JSON is invalid");
	});

	it("saves checkpoint JSON", async () => {
		let written = "";
		const store = new TeamCheckpointStore({
			read: () => undefined,
			write: (value) => {
				written = value;
			},
		});

		await store.save(checkpoint);

		expect(JSON.parse(written)).toEqual(checkpoint);
	});

	it("does not mutate saved checkpoints", async () => {
		const original = structuredClone(checkpoint);
		const store = new TeamCheckpointStore({ read: () => undefined, write: () => undefined });

		await store.save(checkpoint);

		expect(checkpoint).toEqual(original);
	});

	it("preserves unsupported versions for orchestrator-owned validation", async () => {
		const raw = { ...checkpoint, version: 999 };
		const store = new TeamCheckpointStore({ read: () => JSON.stringify(raw), write: () => undefined });

		await expect(store.load()).resolves.toEqual(raw);
	});
});
