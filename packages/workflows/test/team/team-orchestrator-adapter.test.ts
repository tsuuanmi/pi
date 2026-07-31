import type { TaskExecutionReceipt, TaskQueueEvent, TaskSnapshot } from "@tsuuanmi/pi-orchestrator";
import { describe, expect, it } from "vitest";
import {
	mapQueueEvent,
	mapTaskReceipt,
	mapTaskSnapshot,
	mapTaskStatus,
	mapTeamTask,
	mapTeamTasks,
	type TeamEvent,
} from "#workflows/skills/team/orchestrator-adapter";
import type { TeamTask } from "#workflows/skills/team/team-runtime";

const teamTask: TeamTask = {
	version: 1,
	id: "draft",
	title: "Draft",
	description: "Write the draft",
	owner: "writer",
	assignee: "alice",
	status: "pending",
	depends_on: ["outline"],
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
};

const taskSnapshot: TaskSnapshot = {
	id: "draft",
	title: "Draft",
	description: "Write the draft",
	status: "completed",
	assignee: "alice",
	dependsOn: ["outline"],
	requires: { capabilities: ["write"] },
	result: "done",
	attempts: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:10:00.000Z",
};

describe("team orchestrator adapter", () => {
	it("maps workflow tasks to strict orchestrator task inputs", () => {
		const mapped = mapTeamTask(teamTask, {
			capabilities: ["write"],
			tools: ["read"],
			maxRetries: 2,
			retryDelayMs: 100,
			retryBackoff: 2,
		});

		expect(mapped).toEqual({
			id: "draft",
			title: "Draft",
			description: "Write the draft",
			assignee: "alice",
			dependsOn: ["outline"],
			requires: { capabilities: ["write"], tools: ["read"] },
			maxRetries: 2,
			retryDelayMs: 100,
			retryBackoff: 2,
			metadata: { workflowTaskId: "draft", owner: "writer" },
		});
	});

	it("maps task batches without mutating dependency arrays", () => {
		const result = mapTeamTasks({ tasks: [teamTask], routes: { draft: { capabilities: ["write"] } } });

		expect(result.tasks).toHaveLength(1);
		expect(result.tasks[0]?.dependsOn).toEqual(["outline"]);
		expect(teamTask.depends_on).toEqual(["outline"]);
	});

	it("rejects incomplete workflow tasks", () => {
		expect(() => mapTeamTask({ ...teamTask, id: "" })).toThrow("task.id must be non-empty");
		expect(() => mapTeamTask({ ...teamTask, title: "" })).toThrow("task.title must be non-empty");
		expect(() => mapTeamTask({ ...teamTask, description: "" })).toThrow("task.description must be non-empty");
	});

	it("rejects silently normalized workflow task fields", () => {
		expect(() => mapTeamTask({ ...teamTask, id: " draft" })).toThrow("task.id must not have surrounding whitespace");
		expect(() => mapTeamTask({ ...teamTask, depends_on: ["outline "] })).toThrow(
			"task.depends_on[0] must not have surrounding whitespace",
		);
		expect(() => mapTeamTask(teamTask, { assignee: " alice" })).toThrow(
			"route.assignee must not have surrounding whitespace",
		);
	});

	it("maps supported task statuses explicitly", () => {
		expect(mapTaskStatus("pending")).toBe("pending");
		expect(mapTaskStatus("in_progress")).toBe("in_progress");
		expect(mapTaskStatus("completed")).toBe("completed");
		expect(mapTaskStatus("failed")).toBe("failed");
		expect(mapTaskStatus("blocked")).toBe("blocked");
		expect(() => mapTaskStatus("skipped")).toThrow("orchestrator status skipped has no team task status mapping");
	});

	it("maps queue events to workflow-owned event names", () => {
		const event: TaskQueueEvent = {
			type: "task_complete",
			task: taskSnapshot,
			timestamp: "2026-01-01T00:10:00.000Z",
		};

		expect(mapQueueEvent(event)).toEqual({
			type: "team_task_completed",
			taskId: "draft",
			status: "completed",
			timestamp: "2026-01-01T00:10:00.000Z",
		} satisfies TeamEvent);
		expect(mapQueueEvent({ type: "all_complete", timestamp: event.timestamp })).toEqual({
			type: "team_all_complete",
			timestamp: event.timestamp,
		});
	});

	it("maps skipped queue events without inventing a team status", () => {
		const event = mapQueueEvent({
			type: "task_skip",
			task: { ...taskSnapshot, status: "skipped" },
			message: "not needed",
			timestamp: "2026-01-01T00:10:00.000Z",
		});

		expect(event).toEqual({
			type: "team_task_skipped",
			taskId: "draft",
			message: "not needed",
			timestamp: "2026-01-01T00:10:00.000Z",
		});
	});

	it("maps task receipts to references only", () => {
		const receipt = {
			taskId: "draft",
			taskTitle: "Draft",
			agent: "alice",
			status: "completed",
		} as TaskExecutionReceipt;

		expect(mapTaskReceipt(receipt)).toEqual({
			package: "@tsuuanmi/pi-orchestrator",
			type: "task",
			id: "draft",
		});
	});

	it("maps task snapshots to workflow status patches", () => {
		expect(mapTaskSnapshot(taskSnapshot)).toEqual({
			id: "draft",
			status: "completed",
			updated_at: "2026-01-01T00:10:00.000Z",
			completed_at: "2026-01-01T00:10:00.000Z",
		});
	});
});
