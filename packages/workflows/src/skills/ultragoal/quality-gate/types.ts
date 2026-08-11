import type { VerifiedReceipt } from "#workflows/skills/ultragoal/artifacts";

export interface ArtifactRef {
	id: string;
	kind: string;
	description: string;
	path?: string;
	inlineEvidence?: unknown;
	verifiedReceipt?: VerifiedReceipt;
	receipt?: unknown;
}

export interface SurfaceEvidenceRow {
	id: string;
	status?: string;
	surface: string;
	contractRef: string;
	invocation: string;
	verdict?: string;
	result?: string;
	reason?: string;
	artifactRefs?: string[];
}

export interface AdversarialCaseRow {
	id: string;
	contractRef: string;
	scenario: string;
	expectedBehavior: string;
	verdict?: string;
	result?: string;
	artifactRefs?: string[];
}

export interface ContractCoverageRow {
	id: string;
	contractRef: string;
	obligation: string;
	status?: string;
	reason?: string;
	surfaceEvidenceRefs?: string[];
	adversarialCaseRefs?: string[];
	artifactRefs?: string[];
}

export interface ArchitectReview {
	architectureStatus: "CLEAR";
	productStatus: "CLEAR";
	codeStatus: "CLEAR";
	recommendation: "APPROVE";
	commands: string[];
	evidence: string;
	blockers: [];
}

export interface ExecutorQa {
	status: "passed";
	e2eStatus: "passed";
	redTeamStatus: "passed";
	evidence: string;
	e2eCommands: string[];
	redTeamCommands: string[];
	artifactRefs: ArtifactRef[];
	surfaceEvidence: SurfaceEvidenceRow[];
	adversarialCases: AdversarialCaseRow[];
	contractCoverage: ContractCoverageRow[];
	blockers: [];
	changedPaths?: string[];
}

export interface IterationEvidence {
	status: "passed";
	fullRerun: true;
	rerunCommands: string[];
	evidence: string;
	blockers: [];
}

export interface TypedQualityGate {
	architectReview: ArchitectReview;
	executorQa: ExecutorQa;
	iteration: IterationEvidence;
}
