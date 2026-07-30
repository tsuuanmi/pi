export type GateEscalation = "none" | "retry" | "human_blocked";
export type EvidenceMatrixShipDecision = "ship" | "ship_with_caveats" | "blocked";

export interface OptionalGateEvidenceItem {
	kind?: string;
	ref?: string;
	note?: string;
	[key: string]: unknown;
}

export interface EvidenceMatrixVerdict {
	ship_decision: EvidenceMatrixShipDecision;
	escalation: GateEscalation;
	summary?: string;
	evidence?: OptionalGateEvidenceItem[];
}

export interface ContextMapVerdict {
	context_needed: boolean;
	summary?: string;
	evidence?: OptionalGateEvidenceItem[];
}

export type ReviewSeverity = "none" | "low" | "medium" | "high";

export interface ReviewReportVerdict {
	max_severity: ReviewSeverity;
	needs_changes: boolean;
	summary?: string;
	evidence?: OptionalGateEvidenceItem[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalEvidence(value: unknown): OptionalGateEvidenceItem[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.filter(isPlainObject).map((item) => ({ ...item }));
}

function assertGateEscalation(value: unknown): GateEscalation {
	if (value === "none" || value === "retry" || value === "human_blocked") return value;
	throw new Error(`invalid gate escalation: ${String(value)}`);
}

export function validateEvidenceMatrixVerdict(value: unknown): EvidenceMatrixVerdict {
	if (!isPlainObject(value)) throw new Error("evidence_matrix must be an object");
	if (
		value.ship_decision !== "ship" &&
		value.ship_decision !== "ship_with_caveats" &&
		value.ship_decision !== "blocked"
	) {
		throw new Error(`invalid evidence_matrix ship_decision: ${String(value.ship_decision)}`);
	}
	return {
		ship_decision: value.ship_decision,
		escalation: assertGateEscalation(value.escalation),
		summary: optionalString(value.summary),
		evidence: optionalEvidence(value.evidence),
	};
}

export function evidenceMatrixPasses(value: EvidenceMatrixVerdict): boolean {
	return (
		(value.ship_decision === "ship" || value.ship_decision === "ship_with_caveats") &&
		value.escalation !== "human_blocked"
	);
}

export function validateContextMapVerdict(value: unknown): ContextMapVerdict {
	if (!isPlainObject(value)) throw new Error("context_map must be an object");
	if (typeof value.context_needed !== "boolean") {
		throw new Error(`invalid context_map context_needed: ${String(value.context_needed)}`);
	}
	return {
		context_needed: value.context_needed,
		summary: optionalString(value.summary),
		evidence: optionalEvidence(value.evidence),
	};
}

export function validateReviewReportVerdict(value: unknown): ReviewReportVerdict {
	if (!isPlainObject(value)) throw new Error("review_report must be an object");
	if (
		value.max_severity !== "none" &&
		value.max_severity !== "low" &&
		value.max_severity !== "medium" &&
		value.max_severity !== "high"
	) {
		throw new Error(`invalid review_report max_severity: ${String(value.max_severity)}`);
	}
	if (typeof value.needs_changes !== "boolean") {
		throw new Error(`invalid review_report needs_changes: ${String(value.needs_changes)}`);
	}
	return {
		max_severity: value.max_severity,
		needs_changes: value.needs_changes,
		summary: optionalString(value.summary),
		evidence: optionalEvidence(value.evidence),
	};
}

export function reviewReportBlocks(value: ReviewReportVerdict): boolean {
	return value.max_severity === "high" && value.needs_changes;
}
