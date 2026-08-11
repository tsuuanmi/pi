import type { ObstacleRegression } from "#workflows/audit/decision-ledger";
import {
	inputString,
	optionalNumber,
	optionalStringArray,
	output,
	requiredBoolean,
	requiredNumber,
	requiredObject,
	requiredString,
	sessionIdFromInput,
	workflowVerbSet,
} from "#workflows/commands/workflow/command-utils";
import type { WorkflowCommandResult } from "#workflows/commands/workflow/index";
import { handoffWorkflow } from "#workflows/handoff/handoff";
import type { RalplanStage } from "#workflows/session/paths";
import { deepInterviewIndexPath, deepInterviewSpecPath } from "#workflows/session/session-layout";
import { restateGoalGate, runClosureCheckForSession } from "#workflows/skills/deep-interview/closure";
import { assertDeepInterviewHandoff } from "#workflows/skills/deep-interview/guards";
import { planDeepInterviewQuestion } from "#workflows/skills/deep-interview/questions";
import {
	appendOrMergeDeepInterviewRound,
	enrichDeepInterviewRoundScoring,
} from "#workflows/skills/deep-interview/rounds";
import { assertDeepInterviewSpecReady, finalizeDeepInterviewSpecState } from "#workflows/skills/deep-interview/spec";
import type {
	DeepInterviewAdvisoryMetadata,
	DeepInterviewRoundRecord,
	DeepInterviewTopology,
} from "#workflows/skills/deep-interview/types";
import { approveRalplanPlan } from "#workflows/skills/ralplan/approval";
import { writeRalplanArtifact } from "#workflows/skills/ralplan/artifacts";
import { doctorRalplan } from "#workflows/skills/ralplan/doctor";
import { recordRalplanExplorerGateArtifact } from "#workflows/skills/ralplan/gates";
import { readRalplanStatus } from "#workflows/skills/ralplan/index-store";
import type { RalplanApprovalTarget } from "#workflows/skills/ralplan/types";
import {
	completeTeam,
	recordTeamCompletionGateArtifact,
	recordTeamReviewGateArtifact,
} from "#workflows/skills/team/gates";
import { sendTeamMessage } from "#workflows/skills/team/messages";
import { readTeamSnapshot, startTeam } from "#workflows/skills/team/state";
import { createTeamTask, transitionTeamTask } from "#workflows/skills/team/tasks";
import { checkpointUltragoalGoal, restoreUltragoalCheckpoint } from "#workflows/skills/ultragoal/checkpoints";
import { ultragoalGuard } from "#workflows/skills/ultragoal/guard";
import {
	recordUltragoalBlockerClassification,
	recordUltragoalObstacle,
} from "#workflows/skills/ultragoal/obstacle-service";
import type { UltragoalResolvableObstacleKind } from "#workflows/skills/ultragoal/obstacles";
import { createUltragoalPlan, getUltragoalStatus, startNextUltragoalGoal } from "#workflows/skills/ultragoal/plan";
import type { UltragoalGoalMode } from "#workflows/skills/ultragoal/receipt";
import type { UltragoalBlockerClassification } from "#workflows/skills/ultragoal/types";
import { assertSafePathComponent } from "#workflows/state/state-schema";
import { appendJsonl, readFileOrLiteral, writeTextArtifact } from "#workflows/state/state-writer";

export async function deepInterviewVerb(
	action: string | undefined,
	input: Record<string, unknown>,
	json: boolean,
	cwd: string,
): Promise<WorkflowCommandResult> {
	const sessionId = sessionIdFromInput(input);
	const valid = workflowVerbSet("deep-interview");
	if (!action || !valid.has(action))
		throw new Error(`unsupported pi workflow deep-interview verb: ${action ?? "(none)"}`);
	let body: unknown;
	switch (action) {
		case "plan-question": {
			body = await planDeepInterviewQuestion(
				cwd,
				{
					round: requiredNumber(input, "round"),
					questionId: requiredString(input, "questionId"),
					questionText: requiredString(input, "questionText"),
					component: inputString(input, "component"),
					dimension: inputString(input, "dimension"),
					ambiguity: optionalNumber(input, "ambiguity"),
					rationale: requiredString(input, "rationale"),
				},
				sessionId,
			);
			break;
		}
		case "record-answer": {
			body = await appendOrMergeDeepInterviewRound(
				cwd,
				{
					round: requiredNumber(input, "round"),
					round_id: inputString(input, "round_id"),
					questionId: requiredString(input, "questionId"),
					questionText: requiredString(input, "questionText"),
					component: inputString(input, "component"),
					dimension: inputString(input, "dimension"),
					ambiguity: optionalNumber(input, "ambiguity"),
					selectedOptions: optionalStringArray(input, "selectedOptions"),
					customInput: inputString(input, "customInput"),
					topology: input.topology as DeepInterviewTopology | undefined,
				},
				sessionId,
			);
			break;
		}
		case "record-scoring": {
			body = await enrichDeepInterviewRoundScoring(
				cwd,
				{
					round: requiredNumber(input, "round"),
					round_id: inputString(input, "round_id"),
					questionId: requiredString(input, "questionId"),
					scores: requiredObject(input, "scores") as Record<string, number>,
					ambiguity: requiredNumber(input, "ambiguity"),
					triggers: input.triggers as DeepInterviewRoundRecord["triggers"],
					metadata: input.metadata as DeepInterviewAdvisoryMetadata | undefined,
				},
				sessionId,
			);
			break;
		}
		case "closure-check": {
			body = await runClosureCheckForSession(cwd, sessionId);
			break;
		}
		case "restate-goal": {
			body = await restateGoalGate(
				cwd,
				{
					restatedGoal: requiredString(input, "restatedGoal"),
					confirm: requiredString(input, "confirm") as "Yes" | "Adjust" | "Missing",
					adjustment: inputString(input, "adjustment"),
				},
				sessionId,
			);
			break;
		}
		case "write-spec": {
			await assertDeepInterviewSpecReady(cwd, sessionId);
			const slug = requiredString(input, "slug").trim();
			assertSafePathComponent(slug, "slug");
			const handoff = requiredString(input, "handoff");
			assertDeepInterviewHandoff(handoff);
			const content = await readFileOrLiteral(requiredString(input, "spec"), cwd);
			const specPath = deepInterviewSpecPath(cwd, slug, sessionId);
			const result = await writeTextArtifact(specPath, content, { cwd });
			await appendJsonl(
				deepInterviewIndexPath(cwd, sessionId),
				{
					slug,
					path: result.path,
					sha256: result.sha256,
					created_at: result.createdAt,
				},
				{ cwd },
			);
			const handoffTarget = handoff === "stop" ? undefined : handoff;
			const runId = inputString(input, "runId")?.trim();
			if (handoffTarget === "ralplan" && !runId) {
				throw new Error("deep-interview ralplan handoff requires runId");
			}
			if (handoffTarget === "ralplan" || handoffTarget === "team" || handoffTarget === "ultragoal") {
				await finalizeDeepInterviewSpecState(
					cwd,
					{ slug, path: result.path, sha256: result.sha256, handoff: handoffTarget },
					sessionId,
				);
				const calleePatch =
					handoffTarget === "ralplan" ? { run_id: runId, input: result.path } : { input: result.path };
				await handoffWorkflow({
					cwd,
					caller: { skill: "deep-interview", patch: {} },
					callee: { skill: handoffTarget, patch: calleePatch },
					command: "pi deep-interview write-spec",
					sessionId,
				});
			} else {
				await finalizeDeepInterviewSpecState(
					cwd,
					{ slug, path: result.path, sha256: result.sha256, handoff },
					sessionId,
				);
			}
			body = { slug, path: result.path, sha256: result.sha256, handoff: handoffTarget };
			break;
		}
	}
	return { status: 0, stdout: output({ ok: true, body }, json), stderr: "" };
}

export async function ralplanVerb(
	action: string | undefined,
	input: Record<string, unknown>,
	json: boolean,
	cwd: string,
): Promise<WorkflowCommandResult> {
	const sessionId = sessionIdFromInput(input);
	const valid = workflowVerbSet("ralplan");
	if (!action || !valid.has(action)) throw new Error(`unsupported pi workflow ralplan verb: ${action ?? "(none)"}`);
	let body: unknown;
	switch (action) {
		case "record-explorer-gate": {
			body = await recordRalplanExplorerGateArtifact(
				cwd,
				{
					runId: inputString(input, "runId"),
					contextMap: requiredObject(input, "contextMap"),
					recordedBy: inputString(input, "recordedBy"),
				},
				sessionId,
			);
			break;
		}
		case "write-artifact": {
			body = await writeRalplanArtifact(
				cwd,
				{
					runId: inputString(input, "runId"),
					stage: requiredString(input, "stage") as RalplanStage,
					stageN: requiredNumber(input, "stageN"),
					artifact: requiredString(input, "artifact"),
					plannerSubagentId: inputString(input, "plannerSubagentId"),
					plannerResumable: input.plannerResumable === true,
				},
				sessionId,
			);
			break;
		}
		case "status": {
			body = await readRalplanStatus(cwd, sessionId, inputString(input, "runId"));
			break;
		}
		case "doctor": {
			body = await doctorRalplan(cwd, sessionId, inputString(input, "runId"));
			break;
		}
		case "approve-plan": {
			body = await approveRalplanPlan(cwd, {
				runId: inputString(input, "runId"),
				target: requiredString(input, "target") as RalplanApprovalTarget,
				approved: requiredBoolean(input, "approved"),
				note: inputString(input, "note"),
				sessionId,
			});
			break;
		}
	}
	return { status: 0, stdout: output({ ok: true, body }, json), stderr: "" };
}

export async function teamVerb(
	action: string | undefined,
	input: Record<string, unknown>,
	json: boolean,
	cwd: string,
): Promise<WorkflowCommandResult> {
	const sessionId = sessionIdFromInput(input);
	const valid = workflowVerbSet("team");
	if (!action || !valid.has(action)) throw new Error(`unsupported pi workflow team verb: ${action ?? "(none)"}`);
	let body: unknown;
	switch (action) {
		case "start": {
			body = await startTeam(
				cwd,
				{
					task: requiredString(input, "task"),
					teamId: inputString(input, "teamId"),
					workers: (input.workers as { id?: string; name?: string; role?: string }[]) ?? undefined,
				},
				sessionId,
			);
			break;
		}
		case "snapshot": {
			body = await readTeamSnapshot(cwd, sessionId, inputString(input, "teamId"));
			break;
		}
		case "create-task": {
			body = await createTeamTask(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					id: inputString(input, "id"),
					title: requiredString(input, "title"),
					description: requiredString(input, "description"),
					owner: inputString(input, "owner"),
					dependsOn: (input.dependsOn as string[]) ?? undefined,
				},
				sessionId,
			);
			break;
		}
		case "transition-task": {
			body = await transitionTeamTask(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					taskId: requiredString(input, "taskId"),
					status: requiredString(input, "status"),
					workerId: inputString(input, "workerId"),
					evidence: input.evidence as Record<string, unknown> as never,
				},
				sessionId,
			);
			break;
		}
		case "send-message": {
			body = await sendTeamMessage(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					from: requiredString(input, "from"),
					to: requiredString(input, "to"),
					body: requiredString(input, "body"),
					idempotencyKey: inputString(input, "idempotencyKey"),
				},
				sessionId,
			);
			break;
		}
		case "record-review-gate": {
			body = await recordTeamReviewGateArtifact(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					taskId: requiredString(input, "taskId"),
					reviewReport: requiredObject(input, "reviewReport"),
					recordedBy: requiredString(input, "recordedBy"),
				},
				sessionId,
			);
			break;
		}
		case "record-completion-gate": {
			body = await recordTeamCompletionGateArtifact(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					evidenceMatrix: requiredObject(input, "evidenceMatrix"),
					recordedBy: requiredString(input, "recordedBy"),
				},
				sessionId,
			);
			break;
		}
		case "complete": {
			body = await completeTeam(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					phase: inputString(input, "phase") as "complete" | "failed" | "cancelled" | undefined,
					summary: inputString(input, "summary"),
				},
				sessionId,
			);
			break;
		}
	}
	return { status: 0, stdout: output({ ok: true, body }, json), stderr: "" };
}

export async function ultragoalVerb(
	action: string | undefined,
	input: Record<string, unknown>,
	json: boolean,
	cwd: string,
): Promise<WorkflowCommandResult> {
	const sessionId = sessionIdFromInput(input);
	const valid = workflowVerbSet("ultragoal");
	if (!action || !valid.has(action)) throw new Error(`unsupported pi workflow ultragoal verb: ${action ?? "(none)"}`);
	let body: unknown;
	switch (action) {
		case "create-plan": {
			body = await createUltragoalPlan(
				cwd,
				{
					brief: requiredString(input, "brief"),
					goalMode: inputString(input, "goalMode") as UltragoalGoalMode | undefined,
				},
				sessionId,
			);
			break;
		}
		case "status": {
			body = await getUltragoalStatus(cwd, sessionId);
			break;
		}
		case "start-next": {
			body = await startNextUltragoalGoal(cwd, input.retryFailed === true, sessionId);
			break;
		}
		case "checkpoint": {
			body = await checkpointUltragoalGoal(
				cwd,
				{
					goalId: requiredString(input, "goalId"),
					status: requiredString(input, "status"),
					evidence: inputString(input, "evidence"),
					qualityGate: (input.qualityGate as Record<string, unknown>) ?? undefined,
				},
				sessionId,
			);
			break;
		}
		case "restore-checkpoint": {
			body = await restoreUltragoalCheckpoint(
				cwd,
				{
					checkpointId: inputString(input, "checkpointId"),
					expectedPlanHash: inputString(input, "expectedPlanHash"),
				},
				sessionId,
			);
			break;
		}
		case "record-obstacle": {
			const regressionInput = input.regression;
			if (
				regressionInput !== undefined &&
				(!regressionInput || typeof regressionInput !== "object" || Array.isArray(regressionInput))
			) {
				throw new Error("regression must be an object");
			}
			const regressionObject = regressionInput as Record<string, unknown> | undefined;
			const regression: ObstacleRegression | undefined = regressionObject
				? {
						metric: requiredString(regressionObject, "metric"),
						priorValue: requiredNumber(regressionObject, "priorValue"),
						newValue: requiredNumber(regressionObject, "newValue"),
						direction: requiredString(regressionObject, "direction") as ObstacleRegression["direction"],
					}
				: undefined;
			body = await recordUltragoalObstacle(
				cwd,
				{
					goalId: requiredString(input, "goalId"),
					kind: requiredString(input, "kind") as UltragoalResolvableObstacleKind,
					title: requiredString(input, "title"),
					objective: requiredString(input, "objective"),
					evidence: requiredString(input, "evidence"),
					rationale: requiredString(input, "rationale"),
					criterion: inputString(input, "criterion"),
					regression,
				},
				sessionId,
			);
			break;
		}
		case "classify-blocker": {
			body = await recordUltragoalBlockerClassification(
				cwd,
				{
					goalId: inputString(input, "goalId"),
					classification: requiredString(input, "classification") as UltragoalBlockerClassification,
					evidence: requiredString(input, "evidence"),
				},
				sessionId,
			);
			break;
		}
		case "guard": {
			body = await ultragoalGuard(cwd, sessionId, {
				goalId: inputString(input, "goalId"),
				currentObjective: inputString(input, "currentObjective"),
			});
			break;
		}
	}
	return { status: 0, stdout: output({ ok: true, body }, json), stderr: "" };
}
