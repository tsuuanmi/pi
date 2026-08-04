import { dirname, join } from "node:path";
import type { Message } from "@tsuuanmi/pi-ai";
import type { RalplanStage } from "#workflows/session/paths";
import { workflowStatePath } from "#workflows/session/session-layout";
import type { RalplanAgentRole } from "#workflows/skills/ralplan/agent-roles";
import { writeJsonAtomic } from "#workflows/state/state-writer";

export interface RalplanAgentRecord {
	agent_run_id: string;
	role: RalplanAgentRole;
	run_id: string;
	stage: RalplanStage;
	stage_n: number;
	status: "planned" | "completed" | "failed";
	record_path: string;
	planner_subagent_id?: string;
	attempted_resume?: boolean;
	output?: string;
	stderr?: string;
	messages?: Message[];
}

type RalplanAgentRecordInput = Omit<RalplanAgentRecord, "record_path">;

export async function writeRalplanAgentRecord(
	cwd: string,
	sessionId: string | undefined,
	record: RalplanAgentRecordInput,
): Promise<RalplanAgentRecord> {
	const storageSessionId = requiredSessionId(sessionId);
	const recordPath = ralplanAgentRecordPath(cwd, storageSessionId, record.agent_run_id);
	const result = { ...record, record_path: recordPath } satisfies RalplanAgentRecord;
	await writeJsonAtomic(recordPath, result, { cwd });
	return result;
}

function ralplanAgentRecordPath(cwd: string, sessionId: string, agentRunId: string): string {
	return join(dirname(workflowStatePath(cwd, "ralplan", sessionId)), "agents", `${agentRunId}.json`);
}

function requiredSessionId(sessionId: string | undefined): string {
	if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
		throw new Error("ralplan role-agent records require a session id");
	}
	if (sessionId.trim() !== sessionId)
		throw new Error("ralplan role-agent session id must not have surrounding whitespace");
	return sessionId;
}
