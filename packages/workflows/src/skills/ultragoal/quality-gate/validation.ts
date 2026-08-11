import { validateArtifactRefs } from "#workflows/skills/ultragoal/quality-gate/evidence";
import {
	APPROVE_RECOMMENDATION,
	CLEAN_ARCHITECT_STATUS,
	isPlainObject,
	nonEmptyStringArray,
	PASSED_STATUS,
	type Row,
	requiredStringField,
	requireEmptyBlockers,
	requireNonEmptyStringArray,
	requireObject,
} from "#workflows/skills/ultragoal/quality-gate/rows";
import {
	validateAdversarialCases,
	validateContractCoverage,
	validateMandatoryComputerCases,
	validateSurfaceEvidence,
} from "#workflows/skills/ultragoal/quality-gate/surfaces";
import type {
	ArchitectReview,
	ExecutorQa,
	IterationEvidence,
	TypedQualityGate,
} from "#workflows/skills/ultragoal/quality-gate/types";

function validateArchitectReview(gate: Row): ArchitectReview {
	const architectReview = requireObject(gate.architectReview, "architectReview");
	if (
		architectReview.architectureStatus !== CLEAN_ARCHITECT_STATUS ||
		architectReview.productStatus !== CLEAN_ARCHITECT_STATUS ||
		architectReview.codeStatus !== CLEAN_ARCHITECT_STATUS ||
		architectReview.recommendation !== APPROVE_RECOMMENDATION
	) {
		throw new Error(
			`checkpoint --status complete requires architectReview architecture/product/code CLEAR and recommendation APPROVE`,
		);
	}
	requireNonEmptyStringArray(architectReview.commands, "architectReview.commands");
	requiredStringField(architectReview, "evidence", "architectReview");
	requireEmptyBlockers(architectReview.blockers, "architectReview.blockers");
	return architectReview as unknown as ArchitectReview;
}

async function validateExecutorQa(cwd: string, gate: Row): Promise<ExecutorQa> {
	const executorQa = requireObject(gate.executorQa, "executorQa");
	if (
		executorQa.status !== PASSED_STATUS ||
		executorQa.e2eStatus !== PASSED_STATUS ||
		executorQa.redTeamStatus !== PASSED_STATUS
	) {
		throw new Error(`qualityGate executorQa status, e2eStatus, and redTeamStatus must be passed`);
	}
	requireNonEmptyStringArray(executorQa.e2eCommands, "executorQa.e2eCommands");
	requireNonEmptyStringArray(executorQa.redTeamCommands, "executorQa.redTeamCommands");
	requiredStringField(executorQa, "evidence", "executorQa");
	requireEmptyBlockers(executorQa.blockers, "executorQa.blockers");
	if (executorQa.changedPaths !== undefined)
		requireNonEmptyStringArray(executorQa.changedPaths, "executorQa.changedPaths");
	const artifactRefs = await validateArtifactRefs(cwd, executorQa);
	const surfaceEvidence = await validateSurfaceEvidence(cwd, executorQa, artifactRefs);
	const adversarialCases = validateAdversarialCases(executorQa, artifactRefs);
	const contractCoverage = validateContractCoverage(executorQa, surfaceEvidence, adversarialCases, artifactRefs);
	await validateMandatoryComputerCases(cwd, surfaceEvidence, adversarialCases, contractCoverage, artifactRefs);
	return executorQa as unknown as ExecutorQa;
}

function validateIteration(gate: Row): IterationEvidence {
	const iteration = requireObject(gate.iteration, "iteration");
	if (iteration.status !== PASSED_STATUS || iteration.fullRerun !== true) {
		throw new Error(`qualityGate iteration must be passed with fullRerun true`);
	}
	requireNonEmptyStringArray(iteration.rerunCommands, "iteration.rerunCommands");
	requiredStringField(iteration, "evidence", "iteration");
	requireEmptyBlockers(iteration.blockers, "iteration.blockers");
	return iteration as unknown as IterationEvidence;
}

function hasNonEmptyStringField(row: Row, key: string): boolean {
	return typeof row[key] === "string" && row[key].trim().length > 0;
}

function hasNonEmptyStringArrayField(row: Row, key: string): boolean {
	return nonEmptyStringArray(row[key]) !== null;
}

function hasEmptyArrayField(row: Row, key: string): boolean {
	return Array.isArray(row[key]) && row[key].length === 0;
}

function firstRow(value: unknown): Row | undefined {
	if (!Array.isArray(value) || value.length === 0) return undefined;
	return isPlainObject(value[0]) ? value[0] : undefined;
}

function collectCompletionQualityGateShapeProblems(gate: Row): string[] {
	const problems: string[] = [];
	const architect = isPlainObject(gate.architectReview) ? gate.architectReview : undefined;
	if (!architect) problems.push("architectReview");
	else {
		for (const key of ["architectureStatus", "productStatus", "codeStatus", "recommendation", "evidence"]) {
			if (!hasNonEmptyStringField(architect, key)) problems.push(`architectReview.${key}`);
		}
		if (!hasNonEmptyStringArrayField(architect, "commands")) problems.push("architectReview.commands");
		if (!hasEmptyArrayField(architect, "blockers")) problems.push("architectReview.blockers(empty array)");
	}

	const executor = isPlainObject(gate.executorQa) ? gate.executorQa : undefined;
	if (!executor) problems.push("executorQa");
	else {
		for (const key of ["status", "e2eStatus", "redTeamStatus", "evidence"]) {
			if (!hasNonEmptyStringField(executor, key)) problems.push(`executorQa.${key}`);
		}
		for (const key of ["e2eCommands", "redTeamCommands"]) {
			if (!hasNonEmptyStringArrayField(executor, key)) problems.push(`executorQa.${key}`);
		}
		if (!hasEmptyArrayField(executor, "blockers")) problems.push("executorQa.blockers(empty array)");
		const artifact = firstRow(executor.artifactRefs);
		if (!artifact) problems.push("executorQa.artifactRefs[0]");
		else {
			for (const key of ["id", "kind", "description"]) {
				if (!hasNonEmptyStringField(artifact, key)) problems.push(`executorQa.artifactRefs[0].${key}`);
			}
		}
		const surface = firstRow(executor.surfaceEvidence);
		if (!surface) problems.push("executorQa.surfaceEvidence[0]");
		else {
			for (const key of ["id", "surface", "contractRef", "invocation"]) {
				if (!hasNonEmptyStringField(surface, key)) problems.push(`executorQa.surfaceEvidence[0].${key}`);
			}
			if (!hasNonEmptyStringField(surface, "verdict") && !hasNonEmptyStringField(surface, "result")) {
				problems.push("executorQa.surfaceEvidence[0].verdict-or-result");
			}
			if (!hasNonEmptyStringArrayField(surface, "artifactRefs"))
				problems.push("executorQa.surfaceEvidence[0].artifactRefs");
		}
		const adversarial = firstRow(executor.adversarialCases);
		if (!adversarial) problems.push("executorQa.adversarialCases[0]");
		else {
			for (const key of ["id", "contractRef", "scenario", "expectedBehavior"]) {
				if (!hasNonEmptyStringField(adversarial, key)) problems.push(`executorQa.adversarialCases[0].${key}`);
			}
			if (!hasNonEmptyStringField(adversarial, "verdict") && !hasNonEmptyStringField(adversarial, "result")) {
				problems.push("executorQa.adversarialCases[0].verdict-or-result");
			}
			if (!hasNonEmptyStringArrayField(adversarial, "artifactRefs"))
				problems.push("executorQa.adversarialCases[0].artifactRefs");
		}
		const coverage = firstRow(executor.contractCoverage);
		if (!coverage) problems.push("executorQa.contractCoverage[0]");
		else {
			for (const key of ["id", "contractRef", "obligation", "status"]) {
				if (!hasNonEmptyStringField(coverage, key)) problems.push(`executorQa.contractCoverage[0].${key}`);
			}
			if (
				!hasNonEmptyStringArrayField(coverage, "surfaceEvidenceRefs") &&
				!hasNonEmptyStringArrayField(coverage, "adversarialCaseRefs") &&
				!hasNonEmptyStringArrayField(coverage, "artifactRefs")
			) {
				problems.push("executorQa.contractCoverage[0].surfaceEvidenceRefs-or-adversarialCaseRefs-or-artifactRefs");
			}
		}
	}

	const iteration = isPlainObject(gate.iteration) ? gate.iteration : undefined;
	if (!iteration) problems.push("iteration");
	else {
		for (const key of ["status", "evidence"]) {
			if (!hasNonEmptyStringField(iteration, key)) problems.push(`iteration.${key}`);
		}
		if (iteration.fullRerun !== true) problems.push("iteration.fullRerun(true)");
		if (!hasNonEmptyStringArrayField(iteration, "rerunCommands")) problems.push("iteration.rerunCommands");
		if (!hasEmptyArrayField(iteration, "blockers")) problems.push("iteration.blockers(empty array)");
	}
	return problems;
}

export async function validateCompletionQualityGate(cwd: string, qualityGate: unknown): Promise<TypedQualityGate> {
	if (!isPlainObject(qualityGate)) throw new Error("qualityGate must be an object for complete checkpoints");
	if (isPlainObject(qualityGate.codeReview)) {
		throw new Error(`codeReview is unsupported; provide architectReview, executorQa, and iteration`);
	}
	if (qualityGate.contractCoverage !== undefined) {
		throw new Error(`top-level contractCoverage is unsupported; put contractCoverage under executorQa`);
	}
	const allowedKeys = new Set(["architectReview", "executorQa", "iteration"]);
	const unsupportedKeys = Object.keys(qualityGate).filter((key) => !allowedKeys.has(key));
	if (unsupportedKeys.length > 0)
		throw new Error(`qualityGate contains unsupported keys: ${unsupportedKeys.join(", ")}`);
	const shapeProblems = collectCompletionQualityGateShapeProblems(qualityGate);
	if (shapeProblems.length > 0) {
		throw new Error(`qualityGate is missing required complete-checkpoint fields: ${shapeProblems.join(", ")}`);
	}
	const architectReview = validateArchitectReview(qualityGate);
	const executorQa = await validateExecutorQa(cwd, qualityGate);
	const iteration = validateIteration(qualityGate);
	return { architectReview, executorQa, iteration };
}
