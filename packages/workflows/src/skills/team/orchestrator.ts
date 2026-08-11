import type { Agent, AgentOptions } from "@tsuuanmi/pi-agent";
import { Orchestrator, type OrchestratorCheckpointStore, type RunTeamResult, Team } from "@tsuuanmi/pi-orchestrator";
import { mapTaskQueueEvent, type TeamWorkflowEvent } from "#workflows/skills/team/event-mapper";
import { mapTaskReceipt, type TeamTaskReceiptRef } from "#workflows/skills/team/receipt-mapper";
import { mapTaskExecution, mapTeamTasks, type TeamTaskRoute } from "#workflows/skills/team/task-mapper";
import type { TeamTask } from "#workflows/skills/team/types";

export interface TeamOrchestratorInput {
	name: string;
	agents: readonly (Agent | AgentOptions)[];
	tasks: readonly TeamTask[];
	routes?: Readonly<Record<string, TeamTaskRoute>>;
	checkpointStore?: OrchestratorCheckpointStore;
	signal?: AbortSignal;
	onEvent?: (event: TeamWorkflowEvent) => void;
}

export interface TeamOrchestratorOutput {
	result: RunTeamResult;
	taskUpdates: readonly ReturnType<typeof mapTaskExecution>[];
	receiptRefs: readonly TeamTaskReceiptRef[];
}

export async function runTeamOrchestrator(input: TeamOrchestratorInput): Promise<TeamOrchestratorOutput> {
	const name = requiredString(input.name, "name");
	if (input.agents.length === 0) throw new Error("team orchestrator requires at least one agent");
	if (input.tasks.length === 0) throw new Error("team orchestrator requires at least one task");

	const mapped = mapTeamTasks({ tasks: input.tasks, routes: input.routes });
	const team = new Team({ name, agents: input.agents });
	const result = await new Orchestrator().run(team, mapped.tasks, {
		abortSignal: input.signal,
		checkpointFailurePolicy: "strict",
		checkpointStore: input.checkpointStore,
		onQueueEvent: input.onEvent ? (event) => input.onEvent?.(mapTaskQueueEvent(event)) : undefined,
	});

	return Object.freeze({
		result,
		taskUpdates: Object.freeze(result.tasks.map(mapTaskExecution)),
		receiptRefs: Object.freeze(Object.values(result.receipts).map(mapTaskReceipt)),
	});
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	if (value.trim().length === 0) throw new Error(`${field} must be non-empty`);
	if (value.trim() !== value) throw new Error(`${field} must not have surrounding whitespace`);
	return value;
}
