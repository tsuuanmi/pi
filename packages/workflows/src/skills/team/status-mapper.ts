import type { TaskStatus } from "@tsuuanmi/pi-orchestrator";
import type { TeamTaskStatus } from "#workflows/skills/team/team-runtime";

export type TeamExecutionStatus = TaskStatus;

export function mapTaskStatus(status: TaskStatus): TeamTaskStatus {
	switch (status) {
		case "pending":
			return "pending";
		case "in_progress":
			return "in_progress";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		case "blocked":
			return "blocked";
		case "skipped":
			throw new Error("orchestrator status skipped has no team task status mapping");
	}
}

export function mapExecutionStatus(status: TaskStatus): TeamExecutionStatus {
	return status;
}
