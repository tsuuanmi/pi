/**
 * Typed quality-gate schema validation for ultragoal completion evidence (UG-005/006).
 *
 * Hard break: free-form `{ status }` quality gates are rejected. A complete
 * checkpoint must provide typed rows:
 *   { executorQa: { artifactRefs[], surfaceEvidence[] }, contractCoverage[] }
 *
 * Ports Gajae's artifactRefs/surfaceEvidence/contractCoverage orchestration and
 * surface-family structural requirements, but DROPS adversarial red-team cases
 * and CLI replay/exempt machinery (out of scope per spec). The cli surface is
 * reduced to an existing non-empty artifact path OR a typed `VerifiedReceipt`.
 *
 * Acyclic module graph: imports `ultragoal-artifacts.ts` + `shared/canonical-json.ts`
 * only. MUST NOT import `ultragoal-runtime.ts` or `ultragoal-receipt.ts`.
 */
import {
	hasExistingNonEmptyArtifact,
	isLiveSurfaceFamily,
	type SurfaceFamily,
	structuralArtifactKind,
	surfaceFamily,
	type VerifiedReceipt,
	validateStructuralArtifact,
} from "./ultragoal-artifacts.ts";

// Re-export so callers can import the typed shape from the quality-gate module.
export type { VerifiedReceipt };

const COVERED_STATUS = "covered";
const NOT_APPLICABLE_STATUS = "not_applicable";
const ACCEPTED_PROOF_STATUSES = new Set([COVERED_STATUS, "passed", "verified"]);

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

export interface ContractCoverageRow {
	id: string;
	contractRef: string;
	obligation: string;
	status?: string;
	reason?: string;
	surfaceEvidenceRefs?: string[];
	artifactRefs?: string[];
}

export interface ExecutorQa {
	artifactRefs: ArtifactRef[];
	surfaceEvidence: SurfaceEvidenceRow[];
}

export interface TypedQualityGate {
	executorQa: ExecutorQa;
	contractCoverage: ContractCoverageRow[];
}

type Row = Record<string, unknown>;

function isPlainObject(value: unknown): value is Row {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nonEmptyStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const strings: string[] = [];
	for (const item of value) {
		const trimmed = nonEmptyString(item);
		if (!trimmed) return null;
		strings.push(trimmed);
	}
	return strings;
}

function requireObject(value: unknown, fieldName: string): Row {
	if (!isPlainObject(value)) throw new Error(`qualityGate ${fieldName} must be an object`);
	return value;
}

function requireObjectArray(value: unknown, fieldName: string): Row[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`qualityGate ${fieldName} must be a non-empty object array`);
	}
	return value.map((item, index) => requireObject(item, `${fieldName}[${index}]`));
}

function requiredStringField(row: Row, key: string, fieldName: string): string {
	const value = row[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		const hint =
			key === "obligation" && typeof row.description === "string" && row.description.trim().length > 0
				? "; found description, but complete-checkpoint contractCoverage rows require obligation"
				: "";
		throw new Error(`qualityGate ${fieldName}.${key} must be a non-empty string${hint}`);
	}
	return value.trim();
}

function optionalStatusField(row: Row, fieldName: string): string | null {
	if (row.status === undefined) return null;
	const status = requiredStringField(row, "status", fieldName).toLowerCase();
	if (status === "todo") throw new Error(`qualityGate ${fieldName}.status must not be todo`);
	return status;
}

function requireProofStatus(status: string, fieldName: string): void {
	if (!ACCEPTED_PROOF_STATUSES.has(status) && status !== NOT_APPLICABLE_STATUS) {
		throw new Error(`qualityGate ${fieldName}.status must be covered, passed, verified, or not_applicable`);
	}
}

function requireSuccessStatus(status: string, fieldName: string): void {
	requireProofStatus(status, fieldName);
	if (status === NOT_APPLICABLE_STATUS) {
		throw new Error(`qualityGate ${fieldName}.status must be covered, passed, or verified`);
	}
}

function rowOutcomeStatuses(row: Row, fieldName: string): string[] {
	const statuses: string[] = [];
	const status = optionalStatusField(row, fieldName);
	if (status) statuses.push(status);
	const verdict = nonEmptyString(row.verdict);
	if (verdict) statuses.push(verdict.toLowerCase());
	const result = nonEmptyString(row.result);
	if (result) statuses.push(result.toLowerCase());
	if (statuses.length === 0) throw new Error(`qualityGate ${fieldName}.verdict must be a non-empty string`);
	return statuses;
}

function requireSuccessfulRowOutcome(row: Row, fieldName: string): void {
	for (const status of rowOutcomeStatuses(row, fieldName)) requireSuccessStatus(status, fieldName);
}

function requireStringLinks(value: unknown, fieldName: string): string[] {
	const strings = nonEmptyStringArray(value);
	if (!strings) throw new Error(`qualityGate ${fieldName} must be a non-empty string array`);
	return strings.map((item) => item.trim());
}

function optionalStringLinks(row: Row, key: string, fieldName: string): string[] | null {
	if (row[key] === undefined) return null;
	return requireStringLinks(row[key], `${fieldName}.${key}`);
}

function requireResolvedLinks(ids: string[], map: Map<string, Row>, fieldName: string): void {
	for (const id of ids) {
		if (!map.has(id)) throw new Error(`qualityGate ${fieldName} references unknown id ${id}`);
	}
}

function successfulLinkedRows(ids: string[], map: Map<string, Row>, fieldName: string): Row[] {
	const rows: Row[] = [];
	for (const id of ids) {
		const row = map.get(id);
		if (!row) throw new Error(`qualityGate ${fieldName} references unknown id ${id}`);
		requireSuccessfulRowOutcome(row, `${fieldName}.${id}`);
		rows.push(row);
	}
	return rows;
}

function buildRowIdMap(rows: Row[], fieldName: string): Map<string, Row> {
	const ids = new Map<string, Row>();
	for (const [index, row] of rows.entries()) {
		const id = requiredStringField(row, "id", `${fieldName}[${index}]`);
		if (ids.has(id)) throw new Error(`qualityGate ${fieldName} contains duplicate id ${id}`);
		ids.set(id, row);
	}
	return ids;
}

async function validateArtifactRef(row: Row, fieldName: string): Promise<void> {
	requiredStringField(row, "kind", fieldName);
	requiredStringField(row, "description", fieldName);
}

async function validateArtifactRefs(cwd: string, executorQa: Row): Promise<Map<string, Row>> {
	void cwd;
	const rows = requireObjectArray(executorQa.artifactRefs, "executorQa.artifactRefs");
	const idMap = buildRowIdMap(rows, "executorQa.artifactRefs");
	for (const [index, row] of rows.entries()) {
		await validateArtifactRef(row, `executorQa.artifactRefs[${index}]`);
	}
	return idMap;
}

async function artifactHasLiveProof(cwd: string, row: Row, family: SurfaceFamily): Promise<boolean> {
	if (await hasExistingNonEmptyArtifact(cwd, row.path)) return true;
	// cli surfaces (no CLI replay/exempt machinery in this milestone) accept a typed
	// verifiedReceipt as live proof presence (Pi-native reduction of Gajae's CLI replay).
	if (family === "cli") {
		const verifiedReceipt = row.verifiedReceipt;
		if (
			isPlainObject(verifiedReceipt) &&
			nonEmptyString(verifiedReceipt.summary) &&
			nonEmptyString(verifiedReceipt.verifiedAt)
		) {
			return true;
		}
		const receipt = row.receipt;
		if (isPlainObject(receipt) && nonEmptyString(receipt.summary) && nonEmptyString(receipt.verifiedAt)) {
			return true;
		}
	}
	return false;
}

async function validateLiveSurfaceProofPresence(
	cwd: string,
	family: SurfaceFamily,
	artifactIds: string[],
	artifactRefs: Map<string, Row>,
): Promise<void> {
	if (!isLiveSurfaceFamily(family)) return;
	for (const artifactId of artifactIds) {
		const artifact = artifactRefs.get(artifactId);
		if (!artifact) throw new Error(`qualityGate executorQa.artifactRefs references unknown id ${artifactId}`);
		if (await artifactHasLiveProof(cwd, artifact, family)) return;
	}
	throw new Error(
		`qualityGate ${artifactIds.map((id) => `executorQa.artifactRefs.${id}`).join(", ")} must reference a live proof artifact, structural capture, or (for cli surfaces) a typed verifiedReceipt; inlineEvidence alone does not prove live surfaces`,
	);
}

async function requireArtifactProof(cwd: string, row: Row, fieldName: string, family: SurfaceFamily): Promise<void> {
	if (await hasExistingNonEmptyArtifact(cwd, row.path)) return;
	if (await validateStructuralArtifact(cwd, row, fieldName, { surfaceFamily: family, live: true })) return;
	// cli surfaces (no CLI replay/exempt machinery in this milestone) and non-live
	// surfaces accept a typed verifiedReceipt as proof.
	if (family === "cli" || !isLiveSurfaceFamily(family)) {
		const verifiedReceipt = row.verifiedReceipt;
		if (
			isPlainObject(verifiedReceipt) &&
			nonEmptyString(verifiedReceipt.summary) &&
			nonEmptyString(verifiedReceipt.verifiedAt)
		) {
			return;
		}
		const receipt = row.receipt;
		if (isPlainObject(receipt) && nonEmptyString(receipt.summary) && nonEmptyString(receipt.verifiedAt)) {
			return;
		}
	}
	throw new Error(
		`qualityGate ${fieldName} must reference a live proof artifact, structural capture, or (for cli/non-live surfaces) a typed verifiedReceipt`,
	);
}

function validateSurfaceArtifactCompatibility(
	surface: string,
	artifactIds: string[],
	artifactRefs: Map<string, Row>,
	fieldName: string,
): void {
	const family = surfaceFamily(surface);
	const kinds = artifactIds.map((id) => {
		const row = artifactRefs.get(id);
		if (!row) throw new Error(`qualityGate ${fieldName} references unknown id ${id}`);
		const kind = typeof row.kind === "string" ? row.kind.toLowerCase().replaceAll("_", "-") : "";
		return kind;
	});
	if (family === "web") {
		const hasBrowser = kinds.some((kind) =>
			["browser", "playwright", "pandawright", "automation"].some((w) => kind.includes(w)),
		);
		const hasVisual = kinds.some((kind) => ["screenshot", "image", "visual"].some((w) => kind.includes(w)));
		if (!hasBrowser || !hasVisual) {
			throw new Error(
				`qualityGate ${fieldName} for GUI/web surfaces must reference browser automation plus screenshot or image-verdict artifacts`,
			);
		}
		return;
	}
	if (family === "native") {
		const acceptable = kinds.some((kind) =>
			["native", "desktop", "tui", "terminal", "pty", "transcript", "screenshot", "image", "automation"].some((w) =>
				kind.includes(w),
			),
		);
		if (!acceptable) {
			throw new Error(
				`qualityGate ${fieldName} for native surfaces must reference a native/desktop/pty/screenshot/automation artifact`,
			);
		}
		return;
	}
	if (family === "cli") {
		const acceptable = kinds.some((kind) =>
			["cli", "log", "transcript", "terminal", "command", "test-report"].some((w) => kind.includes(w)),
		);
		if (!acceptable) {
			throw new Error(
				`qualityGate ${fieldName} for CLI surfaces must reference a compatible CLI/transcript/terminal/test-report artifact`,
			);
		}
	}
}

async function validateSurfaceStructuralRequirement(
	cwd: string,
	family: SurfaceFamily,
	artifactIds: string[],
	artifactRefs: Map<string, Row>,
	fieldName: string,
): Promise<void> {
	if (family !== "web" && family !== "native") return;
	let hasScreenshot = false;
	let hasAutomation = false;
	let hasPty = false;
	for (const artifactId of artifactIds) {
		const artifact = artifactRefs.get(artifactId);
		if (!artifact) throw new Error(`qualityGate ${fieldName} references unknown id ${artifactId}`);
		const kind = structuralArtifactKind(artifact);
		if (!kind) continue;
		const valid = await validateStructuralArtifact(cwd, artifact, `executorQa.artifactRefs.${artifactId}`, {
			surfaceFamily: family,
			live: true,
		});
		if (kind === "screenshot" && valid) hasScreenshot = true;
		if (kind === "automation" && valid) hasAutomation = true;
		if (kind === "pty" && valid) hasPty = true;
	}
	if (family === "web" && (!hasScreenshot || !hasAutomation)) {
		throw new Error(
			`qualityGate ${fieldName} for GUI/web surfaces must include a valid automation transcript and non-uniform screenshot`,
		);
	}
	if (family === "native" && !hasScreenshot && !hasAutomation && !hasPty) {
		throw new Error(
			`qualityGate ${fieldName} for native surfaces must include a valid screenshot, PTY capture, or app-automation transcript`,
		);
	}
}

async function validateSurfaceEvidence(
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
			requiredStringField(row, "reason", fieldName);
			continue;
		}
		const surface = requiredStringField(row, "surface", fieldName);
		const family = surfaceFamily(surface);
		requireSuccessfulRowOutcome(row, fieldName);
		requiredStringField(row, "invocation", fieldName);
		if (typeof row.verdict !== "string" || row.verdict.trim().length === 0) {
			requiredStringField(row, "result", fieldName);
		}
		const artifactIds = requireStringLinks(row.artifactRefs, `${fieldName}.artifactRefs`);
		requireResolvedLinks(artifactIds, artifactRefs, `${fieldName}.artifactRefs`);
		await validateLiveSurfaceProofPresence(cwd, family, artifactIds, artifactRefs);
		validateSurfaceArtifactCompatibility(surface, artifactIds, artifactRefs, `${fieldName}.artifactRefs`);
		await validateSurfaceStructuralRequirement(cwd, family, artifactIds, artifactRefs, `${fieldName}.artifactRefs`);
		for (const artifactId of artifactIds) {
			const artifact = artifactRefs.get(artifactId)!;
			await requireArtifactProof(cwd, artifact, `executorQa.artifactRefs.${artifactId}`, family);
		}
	}
	return idMap;
}

function validateContractCoverage(
	executorQa: Row,
	surfaceEvidence: Map<string, Row>,
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
		const artifactIds = optionalStringLinks(row, "artifactRefs", fieldName);
		if (!surfaceIds && !artifactIds) {
			throw new Error(`qualityGate ${fieldName} must link to surfaceEvidenceRefs or artifactRefs`);
		}
		let successfulProofLinks = 0;
		if (surfaceIds) {
			successfulProofLinks += successfulLinkedRows(
				surfaceIds,
				surfaceEvidence,
				`${fieldName}.surfaceEvidenceRefs`,
			).length;
		}
		if (artifactIds) {
			requireResolvedLinks(artifactIds, artifactRefs, `${fieldName}.artifactRefs`);
			successfulProofLinks += artifactIds.length;
		}
		if (successfulProofLinks === 0) {
			throw new Error(`qualityGate ${fieldName} must link to at least one successful proof row or artifact`);
		}
	}
	if (!hasSuccessfulContractCoverage) {
		throw new Error(
			"qualityGate executorQa.contractCoverage must include at least one row with status covered, passed, or verified",
		);
	}
	return rows;
}

/**
 * Validate a typed quality gate for a `complete` checkpoint (hard break).
 *
 * Rejects free-form `{ status }` quality gates. Requires `executorQa`
 * (`artifactRefs` + `surfaceEvidence`) and a non-empty `contractCoverage`.
 * The validated object is returned so the runtime can store it as
 * `qualityGateJson` in the checkpoint ledger event (its hash is the receipt's
 * `qualityGateHash` basis).
 */
export async function validateExecutorQaEvidence(cwd: string, qualityGate: unknown): Promise<TypedQualityGate> {
	if (!isPlainObject(qualityGate)) throw new Error("qualityGate must be an object for complete checkpoints");
	// Hard break: a free-form {status} gate (no executorQa/contractCoverage) is rejected.
	if (
		typeof qualityGate.status === "string" &&
		qualityGate.executorQa === undefined &&
		qualityGate.contractCoverage === undefined
	) {
		throw new Error(
			"free-form {status} quality gates are not accepted; provide executorQa (artifactRefs + surfaceEvidence) and contractCoverage typed rows",
		);
	}
	// Gajae parity: reject any top-level key outside the typed shape. A stray
	// `status` alongside typed rows (or any other unsupported key) is rejected.
	const allowedKeys = new Set(["executorQa", "contractCoverage"]);
	const unsupportedKeys = Object.keys(qualityGate).filter((key) => !allowedKeys.has(key));
	if (unsupportedKeys.length > 0) {
		throw new Error(`qualityGate contains unsupported keys: ${unsupportedKeys.join(", ")}`);
	}
	const executorQa = requireObject(qualityGate.executorQa, "qualityGate.executorQa");
	const contractCoverageRows = requireObjectArray(qualityGate.contractCoverage, "qualityGate.contractCoverage");
	const artifactRefs = await validateArtifactRefs(cwd, executorQa);
	const surfaceEvidence = await validateSurfaceEvidence(cwd, executorQa, artifactRefs);
	validateContractCoverage({ ...executorQa, contractCoverage: contractCoverageRows }, surfaceEvidence, artifactRefs);
	return {
		executorQa: executorQa as unknown as ExecutorQa,
		contractCoverage: contractCoverageRows as unknown as ContractCoverageRow[],
	};
}
