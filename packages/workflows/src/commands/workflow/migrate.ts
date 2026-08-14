import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import {
	piSessionRoot,
	sessionActiveStatePath,
	sessionApiUsagePath,
	sessionPlansDir,
	sessionSpecsDir,
	skillDir,
	skillExecutionsDir,
	skillStatePath,
} from "@tsuuanmi/pi/session/layout";
import { appendAuditEntry } from "#workflows/audit/audit-log";
import type { RalplanAgentRole } from "#workflows/skills/ralplan/agent-roles";
import { assertRalplanStage, assertSafePathComponent } from "#workflows/state/state-schema";

const RALPLAN_AGENT_ROLES = new Set<RalplanAgentRole>(["explorer", "planner", "architect", "critic", "expert"]);

interface MigrationMove {
	from: string;
	to: string;
	type: "file" | "directory";
	transform?: "ralplan-executions";
}

export interface SessionLayoutMigrationResult {
	session_id: string;
	dry_run: boolean;
	status: "migrated" | "up-to-date" | "would-migrate";
	moves: Array<{ from: string; to: string }>;
}

function requireSessionId(input: Record<string, unknown>): string {
	const value = input.sessionId;
	if (typeof value !== "string" || !value.trim()) throw new Error("migrate requires input.sessionId");
	return value.trim();
}

async function exists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

function migrationMoves(cwd: string, sessionId: string): MigrationMove[] {
	const root = piSessionRoot(cwd, sessionId);
	return [
		{ from: join(root, "ultragoal"), to: skillDir(cwd, "ultragoal", sessionId), type: "directory" },
		{ from: join(root, "team"), to: skillDir(cwd, "team", sessionId), type: "directory" },
		{
			from: join(root, "plans", "ralplan"),
			to: join(sessionPlansDir(cwd, sessionId), "ralplan"),
			type: "directory",
		},
		{ from: join(root, "specs"), to: sessionSpecsDir(cwd, sessionId), type: "directory" },
		{ from: join(root, "api-usage.jsonl"), to: sessionApiUsagePath(cwd, sessionId), type: "file" },
		{
			from: join(root, "workflows", "active-state.json"),
			to: sessionActiveStatePath(cwd, sessionId),
			type: "file",
		},
		...(["deep-interview", "ralplan", "team", "ultragoal"] as const).map((skill) => ({
			from: join(root, "workflows", skill, "state.json"),
			to: skillStatePath(cwd, skill, sessionId),
			type: "file" as const,
		})),
		{
			from: join(root, "workflows", "ralplan", "agents"),
			to: skillExecutionsDir(cwd, "ralplan", sessionId),
			type: "directory",
			transform: "ralplan-executions",
		},
	];
}

function nestedPath(parent: string, child: string): string | undefined {
	const nested = relative(parent, child);
	return nested && nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested) ? nested : undefined;
}

async function plannedMoves(cwd: string, sessionId: string): Promise<MigrationMove[]> {
	const planned: MigrationMove[] = [];
	for (const move of migrationMoves(cwd, sessionId)) {
		if (!(await exists(move.from))) continue;
		const source = await lstat(move.from);
		if ((move.type === "file" && !source.isFile()) || (move.type === "directory" && !source.isDirectory())) {
			throw new Error(`invalid migration ${move.type}: ${move.from}`);
		}
		const destinationParent = planned.find(
			(earlier) => earlier.type === "directory" && nestedPath(earlier.to, move.to) !== undefined,
		);
		if ((await exists(move.to)) && !destinationParent) {
			throw new Error(`cannot migrate ${move.from}: destination already exists: ${move.to}`);
		}
		if (destinationParent) {
			const nested = nestedPath(destinationParent.to, move.to);
			if (nested && (await exists(join(destinationParent.from, nested)))) {
				throw new Error(`migration destination conflict: ${join(destinationParent.from, nested)} and ${move.from}`);
			}
		}
		planned.push(move);
	}
	return planned;
}

interface ExecutionRecordMigration {
	name: string;
	value: Record<string, unknown>;
}

function requiredRecordString(record: Record<string, unknown>, key: string, sourceName: string): string {
	const value = record[key];
	if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
		throw new Error(`ralplan agent record requires ${key}: ${sourceName}`);
	}
	return value;
}

function workflowExecutionRecord(value: unknown, sourceName: string): ExecutionRecordMigration {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`invalid ralplan agent record: ${sourceName}`);
	}
	const record = value as Record<string, unknown>;
	const subagentId = requiredRecordString(
		{ subagent_id: record.subagent_id ?? record.planner_subagent_id },
		"subagent_id",
		sourceName,
	);
	assertSafePathComponent(subagentId, "subagent_id");
	if (!subagentId.startsWith("subagent-")) throw new Error(`invalid ralplan subagent_id: ${sourceName}`);
	const role = requiredRecordString(record, "role", sourceName);
	if (!RALPLAN_AGENT_ROLES.has(role as RalplanAgentRole)) {
		throw new Error(`invalid ralplan role: ${sourceName}`);
	}
	const runId = requiredRecordString(record, "run_id", sourceName);
	assertSafePathComponent(runId, "run_id");
	const stage = requiredRecordString(record, "stage", sourceName);
	assertRalplanStage(stage);
	if (!Number.isInteger(record.stage_n) || (record.stage_n as number) < 1 || (record.stage_n as number) > 999) {
		throw new Error(`ralplan agent record requires stage_n: ${sourceName}`);
	}
	const artifact = record.status === "completed" ? "valid" : "not-applicable";
	return {
		name: `${subagentId}.json`,
		value: {
			subagent_id: subagentId,
			role,
			run_id: runId,
			stage,
			stage_n: record.stage_n,
			validation: { artifact },
		},
	};
}

async function readExecutionRecords(from: string): Promise<ExecutionRecordMigration[]> {
	const records: ExecutionRecordMigration[] = [];
	const names = new Set<string>();
	for (const sourceName of (await readdir(from)).sort()) {
		if (!sourceName.endsWith(".json")) throw new Error(`unsupported ralplan agent record: ${sourceName}`);
		const sourcePath = join(from, sourceName);
		if (!(await lstat(sourcePath)).isFile()) throw new Error(`invalid ralplan agent record file: ${sourceName}`);
		const migrated = workflowExecutionRecord(JSON.parse(await readFile(sourcePath, "utf8")), sourceName);
		if (names.has(migrated.name)) throw new Error(`duplicate ralplan subagent record: ${migrated.name}`);
		names.add(migrated.name);
		records.push(migrated);
	}
	return records;
}

async function validateTransforms(moves: readonly MigrationMove[]): Promise<void> {
	for (const move of moves) {
		if (move.transform === "ralplan-executions") await readExecutionRecords(move.from);
	}
}

async function migrateExecutionRecords(from: string, to: string): Promise<void> {
	const records = await readExecutionRecords(from);
	await mkdir(to, { recursive: true });
	try {
		for (const record of records) {
			await writeFile(join(to, record.name), `${JSON.stringify(record.value, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx",
			});
		}
	} catch (error) {
		await rm(to, { recursive: true, force: true });
		throw error;
	}
}

async function movePath(move: MigrationMove): Promise<void> {
	await mkdir(dirname(move.to), { recursive: true });
	if (move.transform === "ralplan-executions") {
		await migrateExecutionRecords(move.from, move.to);
		return;
	}
	await rename(move.from, move.to);
}

async function rollbackMove(move: MigrationMove): Promise<void> {
	if (move.transform === "ralplan-executions") {
		await rm(move.to, { recursive: true, force: true });
		return;
	}
	await mkdir(dirname(move.from), { recursive: true });
	await rename(move.to, move.from);
}

async function finalizeMove(move: MigrationMove): Promise<void> {
	if (move.transform === "ralplan-executions") await rm(move.from, { recursive: true });
}

async function pruneEmptyDirs(paths: readonly string[]): Promise<void> {
	for (const path of paths) {
		try {
			if ((await readdir(path)).length === 0) await rm(path, { recursive: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
}

async function pruneEmptyLegacyDirs(cwd: string, sessionId: string): Promise<void> {
	const root = piSessionRoot(cwd, sessionId);
	await pruneEmptyDirs([
		join(root, "workflows", "deep-interview"),
		join(root, "workflows", "ralplan"),
		join(root, "workflows", "team"),
		join(root, "workflows", "ultragoal"),
		join(root, "workflows"),
		join(root, "plans"),
	]);
}

function canonicalMigrationDirs(cwd: string, sessionId: string): string[] {
	const root = piSessionRoot(cwd, sessionId);
	return [
		join(root, "artifacts", "plans"),
		join(root, "artifacts"),
		join(root, "skills", "deep-interview"),
		join(root, "skills", "ralplan"),
		join(root, "skills", "team"),
		join(root, "skills", "ultragoal"),
		join(root, "skills"),
	];
}

async function existingPaths(paths: readonly string[]): Promise<Set<string>> {
	const existing = await Promise.all(paths.map(async (path) => ((await exists(path)) ? path : undefined)));
	return new Set(existing.filter((path): path is string => path !== undefined));
}

async function pruneCreatedCanonicalDirs(
	cwd: string,
	sessionId: string,
	preserved: ReadonlySet<string>,
): Promise<void> {
	await pruneEmptyDirs(canonicalMigrationDirs(cwd, sessionId).filter((path) => !preserved.has(path)));
}

export async function migrateSessionLayout(
	input: Record<string, unknown>,
	options: { cwd: string; dryRun: boolean },
): Promise<SessionLayoutMigrationResult> {
	const sessionId = requireSessionId(input);
	const moves = await plannedMoves(options.cwd, sessionId);
	await validateTransforms(moves);
	const paths = moves.map(({ from, to }) => ({ from, to }));
	if (options.dryRun) {
		return {
			session_id: sessionId,
			dry_run: true,
			status: moves.length ? "would-migrate" : "up-to-date",
			moves: paths,
		};
	}
	const preservedCanonicalDirs = await existingPaths(canonicalMigrationDirs(options.cwd, sessionId));
	const completed: MigrationMove[] = [];
	try {
		for (const move of moves) {
			await movePath(move);
			completed.push(move);
		}
		if (moves.length) {
			await appendAuditEntry(options.cwd, sessionId, {
				ts: new Date().toISOString(),
				category: "state",
				verb: "migrate",
				owner: "pi-workflow",
				mutation_id: `session-layout-${Date.now()}`,
				paths: paths.flatMap(({ from, to }) => [from, to]),
				session_id: sessionId,
			});
		}
	} catch (error) {
		for (const move of completed.reverse()) await rollbackMove(move);
		await pruneCreatedCanonicalDirs(options.cwd, sessionId, preservedCanonicalDirs);
		throw error;
	}
	for (const move of moves) await finalizeMove(move);
	await pruneEmptyLegacyDirs(options.cwd, sessionId);
	return { session_id: sessionId, dry_run: false, status: moves.length ? "migrated" : "up-to-date", moves: paths };
}
