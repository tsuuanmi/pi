import { readFile } from "node:fs/promises";
import { skillStatePath } from "@tsuuanmi/pi/session/layout";
import { writeStageArtifact } from "#workflows/artifacts/artifacts";
import {
	beginRalplanCompletionJournal,
	commitRalplanCompletionJournal,
	markRalplanCompletionStep,
	ralplanCompletionMutationId,
	ralplanCompletionProvenancePath,
	recordRalplanRollback,
	withRalplanCompletionLock,
	writeRalplanCompletionProvenance,
} from "#workflows/skills/ralplan/completion-transaction";
import { buildRalplanHud } from "#workflows/skills/ralplan/hud";
import {
	latestForStageN,
	nextPhase,
	plannerStatePatch,
	plannerStateUpdate,
	ralplanCompletionRole,
	ralplanIndexKey,
	ralplanProgressPatch,
	ralplanWriteFingerprint,
	readRalplanIndex,
	readRalplanStatus,
} from "#workflows/skills/ralplan/index-store";
import { ralplanObstacleFromVerdict, writeRalplanObstacle } from "#workflows/skills/ralplan/obstacles";
import {
	ralplanIndexPath,
	ralplanPendingApprovalPath,
	ralplanStageArtifactPath,
} from "#workflows/skills/ralplan/paths";
import type { RalplanWriteArtifactInput, RalplanWriteArtifactResult } from "#workflows/skills/ralplan/types";
import { parseRalplanVerdict } from "#workflows/skills/ralplan/verdicts";
import { syncWorkflowActiveState } from "#workflows/state/active-state";
import { appendJsonlIdempotent, readFileOrLiteral, sha256, writeTextArtifact } from "#workflows/state/state-writer";
import { activeRalplanRunId, readWorkflowState, writeWorkflowState } from "#workflows/state/workflow-state";

export async function writeRalplanArtifact(
	cwd: string,
	input: RalplanWriteArtifactInput,
	sessionId: string,
): Promise<RalplanWriteArtifactResult> {
	const runId = input.runId === undefined ? await activeRalplanRunId(cwd, sessionId) : input.runId.trim();
	if (!runId) throw new Error("ralplan write-artifact requires an active run or explicit runId");
	return withRalplanCompletionLock(cwd, sessionId, runId, async () => {
		const content = await readFileOrLiteral(input.artifact, cwd);
		const body = content.endsWith("\n") ? content : `${content}\n`;
		const contentSha = sha256(body);
		const plannerState = plannerStateUpdate(input);
		const verdict =
			input.stage === "critic" || input.stage === "architect" ? parseRalplanVerdict(input.stage, body) : undefined;
		const previousState = await readWorkflowState(cwd, "ralplan", { sessionId });
		const index = await readRalplanIndex(cwd, runId, sessionId);
		if (index.invalidLines.length > 0) {
			throw new Error(
				`refusing ralplan completion with invalid index lines: ${index.invalidLines.map((line) => line.line).join(",")}`,
			);
		}
		const artifactPath = ralplanStageArtifactPath(cwd, runId, input.stageN, input.stage, sessionId);
		const existing = latestForStageN(index.rows, input.stage, input.stageN);
		if (existing) {
			if (existing.sha256 !== contentSha || existing.path !== artifactPath) {
				throw new Error(
					`refusing to overwrite ralplan ${input.stage} stage ${input.stageN} at ${existing.path}: an artifact with different content already exists (existing sha256=${existing.sha256}, new sha256=${contentSha}). Use a new stageN to record another pass.`,
				);
			}
			const completionProvenancePath = ralplanCompletionProvenancePath(existing.path);
			await readFile(completionProvenancePath, "utf8");
			return {
				runId,
				path: existing.path,
				stage: input.stage,
				stageN: input.stageN,
				sha256: contentSha,
				createdAt: existing.created_at,
				pendingApprovalPath:
					input.stage === "final" ? ralplanPendingApprovalPath(cwd, runId, sessionId) : undefined,
				deduplicated: true,
				plannerState,
				completionProvenancePath,
				...(existing.verdict ? { verdict: existing.verdict } : {}),
			};
		}
		const beforeFingerprint = ralplanWriteFingerprint({
			previousState,
			rows: index.rows,
			invalid: index.invalidLines,
		});
		const progressPatch = ralplanProgressPatch(previousState, input.stage, verdict);
		const mutationId = ralplanCompletionMutationId({
			sessionId,
			runId,
			stage: input.stage,
			stageN: input.stageN,
			role: ralplanCompletionRole(input.stage),
			artifactPath,
			artifactSha256: contentSha,
		});
		const journalPath = await beginRalplanCompletionJournal({
			cwd,
			mutation_id: mutationId,
			session_id: sessionId,
			run_id: runId,
			stage: input.stage,
			stage_n: input.stageN,
			role: ralplanCompletionRole(input.stage),
			artifact_path: artifactPath,
			artifact_sha256: contentSha,
			snapshot_fingerprint: beforeFingerprint,
			paths: [artifactPath, ralplanIndexPath(cwd, runId, sessionId), skillStatePath(cwd, "ralplan", sessionId)],
			steps: [
				"stage_artifact",
				"index_row",
				"pending_approval",
				"obstacle_ledger",
				"workflow_state",
				"completion_provenance",
				"active_hud",
				"commit",
			],
		});
		const rollbackRemovablePaths: string[] = [];
		try {
			const currentState = await readWorkflowState(cwd, "ralplan", { sessionId });
			const currentIndex = await readRalplanIndex(cwd, runId, sessionId);
			if (
				ralplanWriteFingerprint({
					previousState: currentState,
					rows: currentIndex.rows,
					invalid: currentIndex.invalidLines,
				}) !== beforeFingerprint
			) {
				throw new Error("stale ralplan completion snapshot; retry the write");
			}
			const artifact = await writeStageArtifact({ path: artifactPath, content: body }, { cwd });
			rollbackRemovablePaths.push(artifact.path);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "stage_artifact");
			await appendJsonlIdempotent(
				ralplanIndexPath(cwd, runId, sessionId),
				{
					stage: input.stage,
					stage_n: input.stageN,
					path: artifact.path,
					sha256: artifact.sha256,
					created_at: artifact.createdAt,
					...(verdict ? { verdict } : {}),
				},
				{ cwd, key: ralplanIndexKey },
			);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "index_row");
			// After the append-only index row is visible, do not delete the stage artifact during
			// rollback: removing it would leave the index pointing at a missing product artifact.
			rollbackRemovablePaths.length = 0;
			let pendingApprovalPath: string | undefined;
			if (input.stage === "final") {
				pendingApprovalPath = ralplanPendingApprovalPath(cwd, runId, sessionId);
				await writeTextArtifact(pendingApprovalPath, body, { cwd });
			}
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "pending_approval");
			if (verdict) {
				const obstacle = ralplanObstacleFromVerdict(verdict, artifact.path, artifact.createdAt);
				if (obstacle) await writeRalplanObstacle(cwd, runId, sessionId, obstacle);
			}
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "obstacle_ledger");
			const state = await writeWorkflowState(
				cwd,
				"ralplan",
				{
					active: true,
					current_phase: nextPhase(previousState?.current_phase, input.stage),
					run_id: runId,
					latest_artifact_path: artifact.path,
					pending_approval_path: pendingApprovalPath,
					...plannerStatePatch(plannerState),
					...progressPatch,
				},
				"pi ralplan write-artifact",
				{ sessionId, mutationId },
			);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "workflow_state");
			const completionProvenancePath = await writeRalplanCompletionProvenance({
				cwd,
				artifactPath: artifact.path,
				sessionId,
				runId,
				stage: input.stage,
				stageN: input.stageN,
				role: ralplanCompletionRole(input.stage),
				artifactSha256: artifact.sha256,
				mutationId,
				actor: "pi ralplan write-artifact",
				journalPath,
			});
			rollbackRemovablePaths.push(completionProvenancePath);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "completion_provenance");
			const status = await readRalplanStatus(cwd, sessionId, runId);
			await syncWorkflowActiveState(
				cwd,
				{
					skill: "ralplan",
					active: state.active,
					phase: state.current_phase,
					state_path: skillStatePath(cwd, "ralplan", sessionId),
					hud: buildRalplanHud(status),
				},
				{ sessionId },
			);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "active_hud");
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "commit");
			await commitRalplanCompletionJournal(cwd, sessionId, mutationId);
			return {
				runId,
				path: artifact.path,
				stage: input.stage,
				stageN: input.stageN,
				sha256: artifact.sha256,
				createdAt: artifact.createdAt,
				pendingApprovalPath,
				deduplicated: false,
				plannerState,
				journalPath,
				completionProvenancePath,
				...(verdict ? { verdict } : {}),
			};
		} catch (error) {
			await recordRalplanRollback({ cwd, sessionId, mutationId, paths: rollbackRemovablePaths, error });
			throw error;
		}
	});
}
