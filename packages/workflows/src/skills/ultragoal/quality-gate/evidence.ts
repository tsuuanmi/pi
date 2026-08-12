import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
	hasExistingNonEmptyArtifact,
	isLiveSurfaceFamily,
	type SurfaceFamily,
	structuralArtifactKind,
	surfaceFamily,
	validateStructuralArtifact,
} from "#workflows/skills/ultragoal/artifacts";
import {
	buildRowIdMap,
	isPlainObject,
	nonEmptyString,
	type Row,
	requiredStringField,
	requireObject,
	requireObjectArray,
} from "#workflows/skills/ultragoal/quality-gate/rows";

const CLI_REPLAY_TIMEOUT_MS = 5000;

function normalizeKind(row: Row): string {
	return typeof row.kind === "string" ? row.kind.toLowerCase().replaceAll("_", "-") : "";
}

async function validateArtifactRef(row: Row, fieldName: string): Promise<void> {
	requiredStringField(row, "kind", fieldName);
	requiredStringField(row, "description", fieldName);
}

export async function validateArtifactRefs(cwd: string, executorQa: Row): Promise<Map<string, Row>> {
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
	if (executable === "node") {
		if (args.length === 1 && args[0] === "--version") return true;
		return args.length === 2 && args[0] === "-e" && isDeterministicConsoleLogReplay(args[1]!);
	}
	if (executable === "npm" || executable === "pnpm" || executable === "yarn") {
		return (args.length === 1 && args[0] === "--version") || (args.length === 1 && args[0] === "list");
	}
	if (executable === "git") return isAllowedGitReplayCommand(args);
	// Other executables are not allowed for CLI replay.
	return false;
}

function cliReplayAllowlistDescription(): string {
	return [
		'`node --version` or deterministic `node -e "console.log(...)"`',
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

async function artifactHasLiveProof(cwd: string, row: Row, family: SurfaceFamily): Promise<boolean> {
	if (await hasExistingNonEmptyArtifact(cwd, row.path)) return true;
	if (family === "cli" && (await validateCliReplayArtifact(cwd, row, "executorQa.artifactRefs.cliReplay")))
		return true;
	return false;
}

export async function validateLiveSurfaceProofPresence(
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

export async function requireArtifactProof(
	cwd: string,
	row: Row,
	fieldName: string,
	family: SurfaceFamily,
): Promise<void> {
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

export function validateSurfaceArtifactCompatibility(
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
		const hasAutomation = kinds.some((kind) =>
			["automation", "app-automation", "ui-automation"].some((w) => kind.includes(w)),
		);
		const hasVisual = kinds.some((kind) => ["screenshot", "image", "visual"].some((w) => kind.includes(w)));
		if (!hasAutomation || !hasVisual) {
			throw new Error(
				`qualityGate ${fieldName} for GUI/web surfaces must reference app automation plus screenshot or image-verdict artifacts`,
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

export async function validateSurfaceStructuralRequirement(
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
