import {
	evidenceMatrixPasses,
	reviewReportBlocks,
	validateEvidenceMatrixVerdict,
	validateReviewReportVerdict,
} from "#workflows/policy/gate-verdicts";
import type { TeamSnapshot, TeamTask } from "#workflows/skills/team/runtime";

export function assertRoleResult(snapshot: TeamSnapshot, role: string, taskId?: string): void {
	switch (role) {
		case "worker":
			return;
		case "reviewer":
			assertReview(findTask(snapshot, taskId));
			return;
		case "prover":
			assertCompletion(snapshot);
			return;
		default:
			throw new Error(`unsupported team role: ${role}`);
	}
}

function assertReview(task: TeamTask): void {
	const gate = task.review_gate;
	if (!gate || gate.gate !== "review") {
		throw new Error(`reviewer role must record a review_report for task ${task.id}`);
	}
	if (gate.status !== "passed") {
		throw new Error(`reviewer role requires a passing review_report for task ${task.id}: ${gate.status}`);
	}
	const report = validateReviewReportVerdict({
		max_severity: gate.max_severity,
		needs_changes: gate.needs_changes,
		summary: gate.summary,
	});
	if (reviewReportBlocks(report)) {
		throw new Error(`reviewer role recorded blocking review_report for task ${task.id}`);
	}
}

function assertCompletion(snapshot: TeamSnapshot): void {
	const gate = snapshot.completion_gate;
	if (!gate || gate.gate !== "completion") {
		throw new Error("prover role must record an evidence_matrix");
	}
	if (gate.status !== "passed") {
		throw new Error(`prover role requires a passing evidence_matrix: ${gate.status}`);
	}
	const evidence = validateEvidenceMatrixVerdict({
		ship_decision: gate.ship_decision,
		escalation: gate.escalation,
		summary: gate.summary,
	});
	if (!evidenceMatrixPasses(evidence)) {
		throw new Error("prover role recorded blocking evidence_matrix");
	}
}

function findTask(snapshot: TeamSnapshot, taskId: string | undefined) {
	if (!taskId) throw new Error("team role requires a task id");
	const task = snapshot.tasks.find((item) => item.id === taskId);
	if (!task) throw new Error(`team task not found: ${taskId}`);
	return task;
}
