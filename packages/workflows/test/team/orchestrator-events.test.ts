import type { TaskQueueEvent, TaskSnapshot } from "@tsuuanmi/pi-orchestrator";
import { describe, expect, it, vi } from "vitest";
import { createTeamEventSink, TeamEventSink } from "#workflows/skills/team/orchestrator-events";

const task: TaskSnapshot = {
	id: "draft",
	title: "Draft",
	description: "Write the draft",
	status: "completed",
	assignee: "alice",
	dependsOn: [],
	requires: { capabilities: ["write"] },
	attempts: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:10:00.000Z",
};

const event: TaskQueueEvent = {
	type: "task_complete",
	task,
	timestamp: "2026-01-01T00:10:00.000Z",
};

describe("team event sink", () => {
	it("maps and emits task queue events", async () => {
		const emit = vi.fn();
		const sink = createTeamEventSink({ emit });

		await sink.handle(event);

		expect(emit).toHaveBeenCalledWith({
			type: "team_task_completed",
			taskId: "draft",
			status: "completed",
			attempt: 1,
			timestamp: "2026-01-01T00:10:00.000Z",
		});
	});

	it("maps all-complete events", async () => {
		const emitted: unknown[] = [];
		const sink = new TeamEventSink({
			emit: (item) => {
				emitted.push(item);
			},
		});

		await sink.handle({ type: "all_complete", timestamp: event.timestamp });

		expect(emitted).toEqual([{ type: "team_all_complete", timestamp: event.timestamp }]);
	});

	it("awaits async emit callbacks", async () => {
		const calls: string[] = [];
		const sink = new TeamEventSink({
			emit: async (item) => {
				await Promise.resolve();
				calls.push(item.type);
			},
		});

		await sink.handle(event);

		expect(calls).toEqual(["team_task_completed"]);
	});

	it("propagates emit errors", async () => {
		const sink = new TeamEventSink({
			emit: () => {
				throw new Error("emit failed");
			},
		});

		await expect(sink.handle(event)).rejects.toThrow("emit failed");
	});

	it("does not mutate queue events", async () => {
		const input = structuredClone(event);
		const sink = new TeamEventSink({ emit: () => undefined });

		await sink.handle(input);

		expect(input).toEqual(event);
	});

	it("does not invent a workflow status for skipped tasks", async () => {
		const emitted: unknown[] = [];
		const sink = new TeamEventSink({
			emit: (item) => {
				emitted.push(item);
			},
		});

		await sink.handle({
			type: "task_skip",
			task: { ...task, status: "skipped" },
			message: "not needed",
			timestamp: event.timestamp,
		});

		expect(emitted).toEqual([
			{
				type: "team_task_skipped",
				taskId: "draft",
				message: "not needed",
				attempt: 1,
				timestamp: event.timestamp,
			},
		]);
	});
});
