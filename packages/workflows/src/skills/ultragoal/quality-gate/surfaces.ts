import { surfaceFamily, validateStructuralArtifact } from "#workflows/skills/ultragoal/artifacts";
import {
	requireArtifactProof,
	validateLiveSurfaceProofPresence,
	validateSurfaceArtifactCompatibility,
	validateSurfaceStructuralRequirement,
} from "#workflows/skills/ultragoal/quality-gate/evidence";
import {
	buildRowIdMap,
	NOT_APPLICABLE_STATUS,
	optionalStatusField,
	optionalStringLinks,
	type Row,
	requiredStringField,
	requireObjectArray,
	requireResolvedLinks,
	requireStringLinks,
	requireSuccessfulRowOutcome,
	requireSuccessStatus,
} from "#workflows/skills/ultragoal/quality-gate/rows";

const MANDATORY_COMPUTER_CASE_IDS = [
	"kill-switch-bypass",
	"suspended-enforcement",
	"permission-revoked",
	"display-stale",
	"out-of-bounds-drift",
	"runaway-loop-halt",
	"blast-radius",
];

export async function validateSurfaceEvidence(
	cwd: string,
	executorQa: Row,
	artifactRefs: Map<string, Row>,
): Promise<Map<string, Row>> {
	const rows = requireObjectArray(executorQa.surfaceEvidence, "executorQa.surfaceEvidence");
	const idMap = buildRowIdMap(rows, "executorQa.surfaceEvidence");
	for (const [index, row] of rows.entries()) {
		const fieldName = `executorQa.surfaceEvidence[${index}]`;
		const status = optionalStatusField(row, fieldName);
		requiredStringField(row, "contractRef", fieldName);
		if (status === NOT_APPLICABLE_STATUS) {
			requiredStringField(row, "surface", fieldName);
			requiredStringField(row, "reason", fieldName);
			continue;
		}
		const surface = requiredStringField(row, "surface", fieldName);
		const family = surfaceFamily(surface);
		requireSuccessfulRowOutcome(row, fieldName);
		requiredStringField(row, "invocation", fieldName);
		if (typeof row.verdict !== "string" || row.verdict.trim().length === 0)
			requiredStringField(row, "result", fieldName);
		const artifactIds = requireStringLinks(row.artifactRefs, `${fieldName}.artifactRefs`);
		requireResolvedLinks(artifactIds, artifactRefs, `${fieldName}.artifactRefs`);
		const proofIds = artifactIds;
		await validateLiveSurfaceProofPresence(cwd, family, proofIds, artifactRefs);
		validateSurfaceArtifactCompatibility(surface, proofIds, artifactRefs, `${fieldName}.artifactRefs`);
		await validateSurfaceStructuralRequirement(cwd, family, proofIds, artifactRefs, `${fieldName}.artifactRefs`);
		for (const artifactId of proofIds)
			await requireArtifactProof(
				cwd,
				artifactRefs.get(artifactId)!,
				`executorQa.artifactRefs.${artifactId}`,
				family,
			);
	}
	return idMap;
}

export function validateAdversarialCases(executorQa: Row, artifactRefs: Map<string, Row>): Map<string, Row> {
	const rows = requireObjectArray(executorQa.adversarialCases, "executorQa.adversarialCases");
	const idMap = buildRowIdMap(rows, "executorQa.adversarialCases");
	for (const [index, row] of rows.entries()) {
		const fieldName = `executorQa.adversarialCases[${index}]`;
		requiredStringField(row, "contractRef", fieldName);
		requiredStringField(row, "scenario", fieldName);
		requiredStringField(row, "expectedBehavior", fieldName);
		requireSuccessfulRowOutcome(row, fieldName);
		const artifactIds = requireStringLinks(row.artifactRefs, `${fieldName}.artifactRefs`);
		requireResolvedLinks(artifactIds, artifactRefs, `${fieldName}.artifactRefs`);
	}
	return idMap;
}

export function validateContractCoverage(
	executorQa: Row,
	surfaceEvidence: Map<string, Row>,
	adversarialCases: Map<string, Row>,
	artifactRefs: Map<string, Row>,
): Row[] {
	const rows = requireObjectArray(executorQa.contractCoverage, "executorQa.contractCoverage");
	buildRowIdMap(rows, "executorQa.contractCoverage");
	let hasSuccessfulContractCoverage = false;
	for (const [index, row] of rows.entries()) {
		const fieldName = `executorQa.contractCoverage[${index}]`;
		requiredStringField(row, "contractRef", fieldName);
		const status = optionalStatusField(row, fieldName);
		if (status === NOT_APPLICABLE_STATUS) {
			requiredStringField(row, "reason", fieldName);
			continue;
		}
		requiredStringField(row, "obligation", fieldName);
		if (!status) throw new Error(`qualityGate ${fieldName}.status must be a non-empty string`);
		requireSuccessStatus(status, fieldName);
		hasSuccessfulContractCoverage = true;
		const surfaceIds = optionalStringLinks(row, "surfaceEvidenceRefs", fieldName);
		const caseIds = optionalStringLinks(row, "adversarialCaseRefs", fieldName);
		const artifactIds = optionalStringLinks(row, "artifactRefs", fieldName);
		if (!surfaceIds && !caseIds && !artifactIds) {
			throw new Error(
				`qualityGate ${fieldName} must link to surfaceEvidenceRefs, adversarialCaseRefs, or artifactRefs`,
			);
		}
		if (surfaceIds) requireResolvedLinks(surfaceIds, surfaceEvidence, `${fieldName}.surfaceEvidenceRefs`);
		if (caseIds) requireResolvedLinks(caseIds, adversarialCases, `${fieldName}.adversarialCaseRefs`);
		if (artifactIds) requireResolvedLinks(artifactIds, artifactRefs, `${fieldName}.artifactRefs`);
	}
	if (!hasSuccessfulContractCoverage) {
		throw new Error(
			`qualityGate executorQa.contractCoverage must include at least one row with status covered, passed, or verified`,
		);
	}
	return rows;
}

export async function validateMandatoryComputerCases(
	cwd: string,
	surfaceEvidence: Map<string, Row>,
	adversarialCases: Map<string, Row>,
	contractCoverage: Row[],
	artifactRefs: Map<string, Row>,
): Promise<void> {
	const hasNativeSurface = [...surfaceEvidence.values()].some(
		(row) => surfaceFamily(String(row.surface ?? "")) === "native",
	);
	if (!hasNativeSurface) return;
	for (const caseId of MANDATORY_COMPUTER_CASE_IDS) {
		const row = adversarialCases.get(caseId);
		if (!row)
			throw new Error(
				`COMPUTER_REDTEAM_CASE_MISSING: qualityGate executorQa.adversarialCases must include ${caseId}`,
			);
		const linked = contractCoverage.some(
			(coverage) => Array.isArray(coverage.adversarialCaseRefs) && coverage.adversarialCaseRefs.includes(caseId),
		);
		if (!linked)
			throw new Error(
				`COMPUTER_REDTEAM_CASE_UNLINKED: mandatory computer adversarial case ${caseId} must be linked from contractCoverage.adversarialCaseRefs`,
			);
		const artifactIds = requireStringLinks(row.artifactRefs, `executorQa.adversarialCases.${caseId}.artifactRefs`);
		let hasNativeProof = false;
		for (const artifactId of artifactIds) {
			const artifact = artifactRefs.get(artifactId)!;
			if (
				await validateStructuralArtifact(cwd, artifact, `executorQa.artifactRefs.${artifactId}`, {
					surfaceFamily: "native",
					live: true,
				})
			) {
				hasNativeProof = true;
			}
		}
		if (!hasNativeProof)
			throw new Error(
				`COMPUTER_REDTEAM_ARTIFACT_MISSING: mandatory computer adversarial case ${caseId} requires durable live structural native proof`,
			);
	}
}
