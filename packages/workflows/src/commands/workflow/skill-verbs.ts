import "#workflows/skills/deep-interview/deep-interview-transitions";
import "#workflows/skills/ralplan/ralplan-transitions";
import "#workflows/skills/team/team-transitions";
import "#workflows/skills/ultragoal/ultragoal-transitions";
import type { WorkflowCommandResult } from "#workflows/commands/workflow/types";
import {
	inputString,
	optionalNumber,
	optionalStringArray,
	output,
	requiredNumber,
	requiredObject,
	requiredString,
	sessionIdFromInput,
	workflowVerbSet,
} from "#workflows/commands/workflow/utils";
import { handoffWorkflow } from "#workflows/orchestration/handoff";
import { assertDeepInterviewHandoff } from "#workflows/orchestration/workflow-tool-utils";
import type { RalplanStage } from "#workflows/session/paths";
import { deepInterviewIndexPath, deepInterviewSpecPath } from "#workflows/session/session-layout";
import {
	appendOrMergeDeepInterviewRound,
	assertDeepInterviewSpecReady,
	enrichDeepInterviewRoundScoring,
	finalizeDeepInterviewSpecState,
	planDeepInterviewQuestion,
	readDeepInterviewStateCompact,
	restateGoalGate,
	runClosureCheckForSession,
} from "#workflows/skills/deep-interview/deep-interview-runtime";
import type {
	DeepInterviewAdvisoryMetadata,
	DeepInterviewRoundRecord,
} from "#workflows/skills/deep-interview/deep-interview-state";
import { recordRalplanExplorerGateArtifact } from "#workflows/skills/ralplan/ralplan-gates";
import type { RalplanApprovalTarget } from "#workflows/skills/ralplan/ralplan-runtime";
import {
	approveRalplanPlan,
	doctorRalplan,
	readRalplanCompactStatus,
	readRalplanStatus,
	writeRalplanArtifact,
} from "#workflows/skills/ralplan/ralplan-runtime";
import {
	completeTeam,
	createTeamTask,
	readTeamCompact,
	readTeamSnapshot,
	recordTeamCompletionGateArtifact,
	recordTeamReviewGateArtifact,
	sendTeamMessage,
	startTeam,
	transitionTeamTask,
} from "#workflows/skills/team/team-runtime";
import { ultragoalGuard } from "#workflows/skills/ultragoal/ultragoal-guard";
import type { UltragoalGoalMode } from "#workflows/skills/ultragoal/ultragoal-receipt";
import type { UltragoalBlockerClassification } from "#workflows/skills/ultragoal/ultragoal-runtime";
import {
	checkpointUltragoalGoal,
	createUltragoalPlan,
	getUltragoalStatus,
	readUltragoalCompact,
	recordUltragoalBlockerClassification,
	recordUltragoalReviewBlockers,
	restoreUltragoalCheckpoint,
	startNextUltragoalGoal,
} from "#workflows/skills/ultragoal/ultragoal-runtime";
import { assertSafePathComponent } from "#workflows/state/state-schema";
import { appendJsonl, readFileOrLiteral, writeTextArtifact } from "#workflows/state/state-writer";
import { activeRalplanRunId, defaultWorkflowId } from "#workflows/state/workflow-state";

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
					questionId: inputString(input, "questionId"),
					questionText: requiredString(input, "questionText"),
					component: inputString(input, "component"),
					dimension: inputString(input, "dimension"),
					ambiguity: optionalNumber(input, "ambiguity"),
					rationale: inputString(input, "rationale"),
				},
				sessionId,
			);
			break;
		}
		case "record-answer": {
			body = await appendOrMergeDeepInterviewRound(
				cwd,
				{
					interviewId: inputString(input, "interviewId"),
					round: optionalNumber(input, "round"),
					round_id: inputString(input, "round_id"),
					questionId: inputString(input, "questionId"),
					questionText: inputString(input, "questionText"),
					component: inputString(input, "component"),
					dimension: inputString(input, "dimension"),
					ambiguity: optionalNumber(input, "ambiguity"),
					selectedOptions: optionalStringArray(input, "selectedOptions"),
					customInput: inputString(input, "customInput"),
					topology: input.topology,
				},
				sessionId,
			);
			break;
		}
		case "record-scoring": {
			body = await enrichDeepInterviewRoundScoring(
				cwd,
				{
					interviewId: inputString(input, "interviewId"),
					round: requiredNumber(input, "round"),
					round_id: inputString(input, "round_id"),
					questionId: inputString(input, "questionId"),
					scores: requiredObject(input, "scores") as Record<string, number>,
					ambiguity: requiredNumber(input, "ambiguity"),
					triggers: (input.triggers as DeepInterviewRoundRecord["triggers"]) ?? [],
					metadata: input.metadata as DeepInterviewAdvisoryMetadata | undefined,
				},
				sessionId,
			);
			break;
		}
		case "read-compact": {
			body = await readDeepInterviewStateCompact(cwd, sessionId, optionalNumber(input, "lastN"));
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
			await assertDeepInterviewSpecReady(cwd, sessionId, { allowEarlyExit: input.allowEarlyExit === true });
			const slug = inputString(input, "slug")?.trim() || defaultWorkflowId("spec");
			assertSafePathComponent(slug, "slug");
			const handoff = inputString(input, "handoff");
			if (handoff) assertDeepInterviewHandoff(handoff);
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
			const handoffTarget = handoff as "ralplan" | "ultragoal" | "team" | undefined;
			if (handoffTarget === "ralplan" || handoffTarget === "team" || handoffTarget === "ultragoal") {
				await finalizeDeepInterviewSpecState(
					cwd,
					{ slug, path: result.path, sha256: result.sha256, handoff: handoffTarget },
					sessionId,
				);
				const calleePatch =
					handoffTarget === "ralplan"
						? {
								run_id: (await activeRalplanRunId(cwd, sessionId)) ?? defaultWorkflowId("ralplan"),
								input: result.path,
							}
						: { input: result.path };
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
					{ slug, path: result.path, sha256: result.sha256, handoff: handoff ?? "stop" },
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
		case "read-compact": {
			body = await readRalplanCompactStatus(cwd, sessionId, inputString(input, "runId"));
			break;
		}
		case "doctor": {
			body = await doctorRalplan(cwd, sessionId, inputString(input, "runId"));
			break;
		}
		case "approve-plan": {
			body = await approveRalplanPlan(cwd, {
				runId: inputString(input, "runId"),
				target: inputString(input, "target") as RalplanApprovalTarget | undefined,
				approved: input.approved !== false,
				note: inputString(input, "note"),
				overrideCriticVerdict: input.overrideCriticVerdict === true,
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
		case "read-compact": {
			body = await readTeamCompact(cwd, sessionId, inputString(input, "teamId"));
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
					recordedBy: inputString(input, "recordedBy"),
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
					recordedBy: inputString(input, "recordedBy"),
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
		case "read-compact": {
			body = await readUltragoalCompact(cwd, sessionId);
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
		case "record-review-blockers": {
			body = await recordUltragoalReviewBlockers(
				cwd,
				{
					goalId: requiredString(input, "goalId"),
					title: requiredString(input, "title"),
					objective: requiredString(input, "objective"),
					evidence: requiredString(input, "evidence"),
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
