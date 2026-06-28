/**
 * Full ultragoal completion quality-gate validation.
 *
 * Hard break: complete checkpoints must provide the full parity gate shape:
 *   { architectReview, executorQa, iteration }
 *
 * Old Pi `{ executorQa, contractCoverage }` gates, legacy `codeReview`, and
 * unsupported top-level keys are rejected. Gajae-only hooks are adapted to Pi:
 * no GJC goal snapshots/sessions and no `gjc read|status` CLI replay allowlist.
 *
 * Acyclic module graph: imports `ultragoal-artifacts.ts` only. MUST NOT import
 * `ultragoal-runtime.ts` or `ultragoal-receipt.ts`.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import {
	hasExistingNonEmptyArtifact,
	isLiveSurfaceFamily,
	type SurfaceFamily,
	structuralArtifactKind,
	surfaceFamily,
	type VerifiedReceipt,
	validateStructuralArtifact,
} from "./ultragoal-artifacts.ts";

export type { VerifiedReceipt };

const PASSED_STATUS = "passed";
const COVERED_STATUS = "covered";
const VERIFIED_STATUS = "verified";
const NOT_APPLICABLE_STATUS = "not_applicable";
const ACCEPTED_PROOF_STATUSES = new Set([COVERED_STATUS, PASSED_STATUS, VERIFIED_STATUS]);
const CLEAN_ARCHITECT_STATUS = "CLEAR";
const APPROVE_RECOMMENDATION = "APPROVE";
const CLI_REPLAY_TIMEOUT_MS = 5000;
const CLI_REPLAY_EXEMPT_REASON_CODES = new Set([
	"unsafe_side_effect",
	"requires_credentials",
	"requires_network",
	"non_deterministic_external",
	"destructive",
	"interactive_only",
	"platform_unavailable",
]);
const MANDATORY_COMPUTER_CASE_IDS = [
	"kill-switch-bypass",
	"suspended-enforcement",
	"permission-revoked",
	"display-stale",
	"out-of-bounds-drift",
	"runaway-loop-halt",
	"blast-radius",
];

export interface ArtifactRef {
	id: string;
	kind: string;
	description: string;
	path?: string;
	inlineEvidence?: unknown;
	verifiedReceipt?: VerifiedReceipt;
	receipt?: unknown;
	replayExempt?: unknown;
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
				? "; found description, but contractCoverage rows require obligation"
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

function requireStringLinks(value: unknown, fieldName: string): string[] {
	const strings = nonEmptyStringArray(value);
	if (!strings) throw new Error(`qualityGate ${fieldName} must be a non-empty string array`);
	return strings;
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

function buildRowIdMap(rows: Row[], fieldName: string): Map<string, Row> {
	const ids = new Map<string, Row>();
	for (const [index, row] of rows.entries()) {
		const id = requiredStringField(row, "id", `${fieldName}[${index}]`);
		if (ids.has(id)) throw new Error(`qualityGate ${fieldName} contains duplicate id ${id}`);
		ids.set(id, row);
	}
	return ids;
}

function requireEmptyBlockers(value: unknown, fieldName: string): void {
	if (!Array.isArray(value)) throw new Error(`qualityGate ${fieldName} must be an empty array`);
	if (value.length !== 0) throw new Error(`qualityGate ${fieldName} must be empty`);
}

function requireNonEmptyStringArray(value: unknown, fieldName: string): string[] {
	const result = nonEmptyStringArray(value);
	if (!result) throw new Error(`qualityGate ${fieldName} must be a non-empty string array`);
	return result;
}

function normalizeKind(row: Row): string {
	return typeof row.kind === "string" ? row.kind.toLowerCase().replaceAll("_", "-") : "";
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

function hasShellRedirectionToken(value: string): boolean {
	return /[|&;<>()`$]/.test(value) || value.includes("\n") || value.includes("\r");
}

function basenameCommand(value: string): string {
	return value.replaceAll("\\", "/").split("/").at(-1) ?? value;
}

function isBareExecutableName(value: string): boolean {
	return (
		/^[a-z0-9._-]+$/.test(value) && !value.includes("/") && !value.includes("\\") && value === value.toLowerCase()
	);
}

function isDeterministicConsoleLogReplay(value: string): boolean {
	return /^console\.log\((?:"[A-Za-z0-9 .:_-]*"|'[A-Za-z0-9 .:_-]*')\);?$/.test(value.trim());
}

function isAllowedGitReplayCommand(args: readonly string[]): boolean {
	if (args.length === 0) return false;
	const safe = new Set(["status", "rev-parse", "merge-base", "diff", "show", "log"]);
	if (!safe.has(args[0]!)) return false;
	return args.every((arg) => !hasShellRedirectionToken(arg) && !["--output", "-o"].includes(arg));
}

function isAllowedCliReplayCommand(command: readonly string[]): boolean {
	if (
		command.length === 0 ||
		command.some((arg) => arg.trim() !== arg || arg.length === 0 || hasShellRedirectionToken(arg))
	) {
		return false;
	}
	if (!isBareExecutableName(command[0]!)) return false;
	const executable = basenameCommand(command[0]!);
	const args = command.slice(1);
	if (executable === "bun" || executable === "node") {
		if (args.length === 1 && args[0] === "--version") return true;
		return args.length === 2 && args[0] === "-e" && isDeterministicConsoleLogReplay(args[1]!);
	}
	if (executable === "npm" || executable === "pnpm" || executable === "yarn") {
		return (args.length === 1 && args[0] === "--version") || (args.length === 1 && args[0] === "list");
	}
	if (executable === "git") return isAllowedGitReplayCommand(args);
	// Pi-native adaptation: do not allow GJC-specific `gjc read|status`.
	return false;
}

function cliReplayAllowlistDescription(): string {
	return [
		'`bun --version`, `node --version`, or deterministic `bun/node -e "console.log(...)"`',
		"`npm|pnpm|yarn --version` or `npm|pnpm|yarn list`",
		"read-only `git status|rev-parse|merge-base|diff|show|log` with safe args",
	].join("; ");
}

async function runReplayCommand(command: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command[0]!, command.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => {
			child.kill();
			reject(new Error("CLI replay timed out"));
		}, CLI_REPLAY_TIMEOUT_MS);
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timeout);
			if (code !== 0) reject(new Error(`CLI replay exited ${code}: ${stderr}`));
			else resolve(stdout);
		});
	});
}

async function readArtifactJson(cwd: string, row: Row, fieldName: string): Promise<Row | null> {
	const rawPath = nonEmptyString(row.path);
	if (!rawPath) return null;
	const path = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
	try {
		const parsed = JSON.parse(await readFile(path, "utf8"));
		return requireObject(parsed, fieldName);
	} catch (error) {
		throw new Error(`qualityGate ${fieldName} must reference a readable JSON artifact: ${String(error)}`);
	}
}

async function validateCliReplayArtifact(cwd: string, row: Row, fieldName: string): Promise<boolean> {
	const kind = normalizeKind(row);
	if (!kind.includes("cli-replay") && !kind.includes("command-replay")) return false;
	const record =
		(await readArtifactJson(cwd, row, fieldName)) ?? requireObject(row.inlineEvidence, `${fieldName}.inlineEvidence`);
	if (record.schemaVersion !== 1) throw new Error(`qualityGate ${fieldName}.schemaVersion must be 1`);
	if (record.kind !== "cli-replay") throw new Error(`qualityGate ${fieldName}.kind must be cli-replay`);
	if (record.replaySafe !== true) throw new Error(`qualityGate ${fieldName}.replaySafe must be true`);
	if (!Array.isArray(record.command) || record.command.some((item) => typeof item !== "string")) {
		throw new Error(`qualityGate ${fieldName}.command must be a string array`);
	}
	const command = record.command as string[];
	if (!isAllowedCliReplayCommand(command)) {
		throw new Error(
			`qualityGate ${fieldName}.command is not in the conservative CLI replay allowlist. Allowed replay commands: ${cliReplayAllowlistDescription()}`,
		);
	}
	const recordedStdout = typeof record.recordedStdout === "string" ? record.recordedStdout : null;
	if (recordedStdout === null) throw new Error(`qualityGate ${fieldName}.recordedStdout must be a string`);
	const stdout = await runReplayCommand(command, cwd);
	if (stdout !== recordedStdout)
		throw new Error(`qualityGate ${fieldName}.recordedStdout does not match replayed stdout`);
	return true;
}

function validateReplayExempt(row: Row, artifactRefs: Map<string, Row>, fieldName: string): string[] | null {
	if (row.replayExempt === undefined) return null;
	const exempt = requireObject(row.replayExempt, `${fieldName}.replayExempt`);
	const reasonCode = requiredStringField(exempt, "reasonCode", `${fieldName}.replayExempt`);
	if (!CLI_REPLAY_EXEMPT_REASON_CODES.has(reasonCode)) {
		throw new Error(`qualityGate ${fieldName}.replayExempt.reasonCode is unsupported`);
	}
	if (requiredStringField(exempt, "reason", `${fieldName}.replayExempt`).split(/\s+/).length < 4) {
		throw new Error(`qualityGate ${fieldName}.replayExempt.reason must be substantive`);
	}
	requiredStringField(exempt, "approvedBy", `${fieldName}.replayExempt`);
	const fallbackRefs = requireStringLinks(
		exempt.fallbackArtifactRefs,
		`${fieldName}.replayExempt.fallbackArtifactRefs`,
	);
	requireResolvedLinks(fallbackRefs, artifactRefs, `${fieldName}.replayExempt.fallbackArtifactRefs`);
	return fallbackRefs;
}

async function artifactHasLiveProof(cwd: string, row: Row, family: SurfaceFamily): Promise<boolean> {
	if (await hasExistingNonEmptyArtifact(cwd, row.path)) return true;
	if (family === "cli" && (await validateCliReplayArtifact(cwd, row, "executorQa.artifactRefs.cliReplay")))
		return true;
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
		`qualityGate ${artifactIds.map((id) => `executorQa.artifactRefs.${id}`).join(", ")} must reference a live proof artifact, structural capture, or CLI replay; inlineEvidence alone does not prove live surfaces`,
	);
}

async function requireArtifactProof(cwd: string, row: Row, fieldName: string, family: SurfaceFamily): Promise<void> {
	if (await hasExistingNonEmptyArtifact(cwd, row.path)) return;
	if (await validateStructuralArtifact(cwd, row, fieldName, { surfaceFamily: family, live: true })) return;
	if (family === "cli" && (await validateCliReplayArtifact(cwd, row, fieldName))) return;
	if (!isLiveSurfaceFamily(family)) {
		const verifiedReceipt = row.verifiedReceipt;
		if (
			isPlainObject(verifiedReceipt) &&
			nonEmptyString(verifiedReceipt.summary) &&
			nonEmptyString(verifiedReceipt.verifiedAt)
		) {
			return;
		}
		const receipt = row.receipt;
		if (isPlainObject(receipt) && nonEmptyString(receipt.summary) && nonEmptyString(receipt.verifiedAt)) return;
	}
	throw new Error(`qualityGate ${fieldName} must reference a live proof artifact, structural capture, or CLI replay`);
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
		return normalizeKind(row);
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
			["cli", "log", "transcript", "terminal", "command", "test-report", "command-replay"].some((w) =>
				kind.includes(w),
			),
		);
		if (!acceptable) throw new Error(`qualityGate ${fieldName} for CLI surfaces must reference compatible CLI proof`);
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
		const exemptFallbacks: string[] = [];
		for (const artifactId of artifactIds) {
			const fallback = validateReplayExempt(
				artifactRefs.get(artifactId)!,
				artifactRefs,
				`executorQa.artifactRefs.${artifactId}`,
			);
			if (fallback) exemptFallbacks.push(...fallback);
		}
		const proofIds = exemptFallbacks.length > 0 ? exemptFallbacks : artifactIds;
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

function validateAdversarialCases(executorQa: Row, artifactRefs: Map<string, Row>): Map<string, Row> {
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

function validateContractCoverage(
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

async function validateMandatoryComputerCases(
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

export async function validateCompletionQualityGate(cwd: string, qualityGate: unknown): Promise<TypedQualityGate> {
	if (!isPlainObject(qualityGate)) throw new Error("qualityGate must be an object for complete checkpoints");
	if (isPlainObject(qualityGate.codeReview)) {
		throw new Error(`legacy codeReview gates are not accepted; provide architectReview, executorQa, and iteration`);
	}
	if (qualityGate.contractCoverage !== undefined) {
		throw new Error(`old top-level contractCoverage gates are not accepted; put contractCoverage under executorQa`);
	}
	const allowedKeys = new Set(["architectReview", "executorQa", "iteration"]);
	const unsupportedKeys = Object.keys(qualityGate).filter((key) => !allowedKeys.has(key));
	if (unsupportedKeys.length > 0)
		throw new Error(`qualityGate contains unsupported keys: ${unsupportedKeys.join(", ")}`);
	const architectReview = validateArchitectReview(qualityGate);
	const executorQa = await validateExecutorQa(cwd, qualityGate);
	const iteration = validateIteration(qualityGate);
	return { architectReview, executorQa, iteration };
}

// Backward-compatible export name for call sites; behavior is now a hard-break
// full completion gate, not the old executorQa+contractCoverage shape.
export const validateExecutorQaEvidence = validateCompletionQualityGate;
