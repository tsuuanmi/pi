import type { TaskQueueEvent } from "@tsuuanmi/pi-orchestrator";
import { mapTaskStatus } from "#workflows/skills/team/status-mapper";
import type { TeamTaskStatus } from "#workflows/skills/team/types";

export interface TeamEvent {
	type:
		| "team_task_ready"
		| "team_task_started"
		| "team_task_completed"
		| "team_task_failed"
		| "team_task_skipped"
		| "team_task_blocked"
		| "team_all_complete";
	taskId?: string;
	status?: TeamTaskStatus;
	message?: string;
	attempt?: number;
	timestamp: string;
}

export function mapQueueEvent(event: TaskQueueEvent): TeamEvent {
	const taskId = event.task?.id;
	const status = event.task && event.task.status !== "skipped" ? mapTaskStatus(event.task.status) : undefined;
	const base = {
		...(taskId ? { taskId } : {}),
		...(status ? { status } : {}),
		...(event.message ? { message: event.message } : {}),
		...(event.task && Number.isInteger(event.task.attempts) ? { attempt: event.task.attempts } : {}),
		timestamp: event.timestamp,
	};
	switch (event.type) {
		case "task_ready":
			return Object.freeze({ ...base, type: "team_task_ready" });
		case "task_start":
			return Object.freeze({ ...base, type: "team_task_started" });
		case "task_complete":
			return Object.freeze({ ...base, type: "team_task_completed" });
		case "task_fail":
			return Object.freeze({ ...base, type: "team_task_failed" });
		case "task_skip":
			return Object.freeze({ ...base, type: "team_task_skipped" });
		case "task_block":
			return Object.freeze({ ...base, type: "team_task_blocked" });
		case "all_complete":
			return Object.freeze({ ...base, type: "team_all_complete" });
	}
}
