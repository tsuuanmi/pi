import { dirname, join } from "node:path";
import type { SubagentMetadataValue, SubagentRecord } from "@tsuuanmi/pi-orchestrator";
import {
	assertExpectedNextRole,
	assertNoGuardedSpawnOverrides,
	expectedNextRalplanRole,
	guardedSpawnMetadata,
	type RalplanSelectorVerdict,
} from "#workflows/policy/expected-next-role";
import type { RalplanStage } from "#workflows/session/paths";
import { ralplanGateArtifactPath, workflowStatePath } from "#workflows/session/session-layout";
import { normalizeRalplanExplorerGate } from "#workflows/skills/ralplan/gates";
import { readRalplanStatus } from "#workflows/skills/ralplan/index-store";
import { buildRalplanOrchestrationSnapshot } from "#workflows/skills/ralplan/orchestration-snapshot";
import { assertRalplanStage, assertSafePathComponent } from "#workflows/state/state-schema";
import { writeJsonAtomic } from "#workflows/state/state-writer";
import { readWorkflowState } from "#workflows/state/workflow-state";
import type { WorkflowSubagentSpawnInput } from "#workflows/tool/subagent-spawn";

export async function assertRalplanSubagentSpawn(
	input: WorkflowSubagentSpawnInput,
	cwd: string,
	sessionId: string,
): Promise<boolean> {
	const metadata = readMetadata(input.metadata);
	if (metadata?.workflow !== "ralplan") return false;
	if (input.systemPrompt === undefined) throw new Error("ralplan subagent_spawn requires caller-defined systemPrompt");
	const runId = requiredMetadata(metadata, "runId");
	assertSafePathComponent(runId, "metadata.runId");
	const state = await readWorkflowState(cwd, "ralplan", { sessionId });
	const status = await readRalplanStatus(cwd, sessionId, runId);
	const explorerGate = normalizeRalplanExplorerGate(state?.explorer_gate);
	const expected = expectedNextRalplanRole(
		{
			current_phase: state?.current_phase as string | undefined,
			latest: status?.latest
				? { stage: status.latest.stage, verdict: status.latest.verdict as RalplanSelectorVerdict | undefined }
				: undefined,
			explorerGate: { status: explorerGate?.status ?? "missing" },
			iterateCount: typeof state?.iterate_count === "number" ? state.iterate_count : undefined,
			iterateCap: typeof state?.iterate_cap === "number" ? state.iterate_cap : undefined,
			expertEscalation: state?.expert_escalation === true,
			expertCount: typeof state?.expert_count === "number" ? state.expert_count : undefined,
			expertCap: typeof state?.expert_cap === "number" ? state.expert_cap : undefined,
		},
		runId,
	);
	if (!expected) throw new Error("no legal next ralplan agent spawn");
	const stage = requiredMetadata(metadata, "stage");
	const role = requiredString(input.role, "role");
	assertExpectedNextRole(expected, {
		skill: "ralplan",
		stage,
		role,
		owner: requiredMetadata(metadata, "owner"),
		runId,
	});
	assertMetadata(metadata, guardedSpawnMetadata(expected));
	assertNoGuardedSpawnOverrides(input);
	if (input.agent !== expected.role)
		throw new Error(`ralplan ${expected.stage} requires agent profile ${expected.role}`);
	positiveIntegerMetadata(metadata, "stageN");
	return true;
}

export async function recordRalplanAgentExecution(
	cwd: string,
	sessionId: string,
	record: SubagentRecord,
): Promise<string | undefined> {
	const metadata = readMetadata(record.execution_metadata);
	if (metadata?.workflow !== "ralplan" || record.status === "queued" || record.status === "running") return undefined;
	const runId = requiredMetadata(metadata, "runId");
	assertSafePathComponent(runId, "execution_metadata.runId");
	const stage = requiredMetadata(metadata, "stage");
	assertRalplanStage(stage);
	const stageN = positiveIntegerMetadata(metadata, "stageN");
	const validArtifact =
		record.status === "completed" ? await verifyArtifact(cwd, sessionId, runId, stage, stageN) : false;
	const workflowStatus = record.status === "completed" && !validArtifact ? "failed" : record.status;
	const recordPath = join(dirname(workflowStatePath(cwd, "ralplan", sessionId)), "agents", `${record.id}.json`);
	await writeJsonAtomic(
		recordPath,
		{
			subagent_id: record.id,
			role: requiredMetadata(metadata, "role"),
			run_id: runId,
			stage,
			stage_n: stageN,
			status: workflowStatus,
			record_path: recordPath,
			runtime_artifact_path: record.artifact_file,
			output_artifact_path: record.output_artifact?.path,
			output: record.result_text,
			error: record.error_text,
			updated_at: record.updated_at,
		},
		{ cwd },
	);
	if (record.status === "completed" && !validArtifact) {
		return `ralplan ${stage} stage ${stageN} completed without a valid workflow artifact`;
	}
	if (record.status === "failed" || record.status === "cancelled") {
		return record.error_text ?? `ralplan ${stage} stage ${stageN} ${record.status}`;
	}
	return undefined;
}

async function verifyArtifact(
	cwd: string,
	sessionId: string,
	runId: string,
	stage: RalplanStage,
	stageN: number,
): Promise<boolean> {
	const snapshot = await buildRalplanOrchestrationSnapshot({ cwd, sessionId, runId });
	if (stage === "pre-planner") {
		const gate = snapshot.explorerGate;
		return (
			gate?.status === "passed" &&
			"artifact_path" in gate &&
			gate.artifact_path === ralplanGateArtifactPath(cwd, runId, "explorer", gate.attempt, sessionId)
		);
	}
	const artifact = snapshot.index.rows.find((row) => row.stage === stage && row.stage_n === stageN);
	return (
		artifact !== undefined &&
		snapshot.artifactHealth.health === "complete" &&
		snapshot.provenanceHealth.health === "complete" &&
		snapshot.transactionJournal.health === "complete"
	);
}

function readMetadata(value: unknown): Record<string, SubagentMetadataValue> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, SubagentMetadataValue>)
		: undefined;
}

function assertMetadata(actual: Record<string, SubagentMetadataValue>, expected: Record<string, string>): void {
	for (const [key, value] of Object.entries(expected)) {
		if (actual[key] !== value) throw new Error(`subagent_spawn metadata ${key} must be ${value}`);
	}
}

function positiveIntegerMetadata(metadata: Record<string, SubagentMetadataValue>, field: string): number {
	const value = metadata[field];
	if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 999) {
		throw new Error(`metadata.${field} must be an integer from 1 through 999`);
	}
	return value as number;
}

function requiredMetadata(metadata: Record<string, SubagentMetadataValue>, field: string): string {
	return requiredString(metadata[field], `metadata.${field}`);
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
		throw new Error(`${field} must be a non-empty string without surrounding whitespace`);
	}
	return value;
}
