import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { withFileMutationQueue } from "@tsuuanmi/pi-agent/node";
import { sessionStateDir } from "#pi/session/root";
import type { SubagentRecord, SubagentStatus } from "#pi/subagents/types";

export class SubagentStore {
	private readonly cwd: string;

	constructor(cwd: string) {
		this.cwd = cwd;
	}

	recordPath(id: string, sessionId: string): string {
		return join(this.root(sessionId), id, "record.json");
	}

	artifactPath(id: string, sessionId: string): string {
		return join(this.root(sessionId), id, "artifact.json");
	}

	sessionLogDir(sessionId: string): string {
		return join(this.root(sessionId), "sessions");
	}

	async write(record: SubagentRecord, sessionId: string): Promise<SubagentRecord> {
		await writeJsonAtomic(this.recordPath(record.id, sessionId), { ...record });
		await appendJsonlAtomic(this.indexPath(sessionId), {
			id: record.id,
			role: record.role,
			status: record.status,
			updated_at: record.updated_at,
			session_file: record.session_file,
		});
		return record;
	}

	async terminal(
		record: SubagentRecord,
		status: SubagentStatus,
		sessionId: string,
		extra: Partial<SubagentRecord> = {},
	): Promise<SubagentRecord> {
		const now = new Date().toISOString();
		const terminalRecord = {
			...record,
			...extra,
			artifact_file: record.artifact_file ?? this.artifactPath(record.id, sessionId),
			status,
			updated_at: now,
			completed_at: now,
		};
		await this.writeArtifact(terminalRecord, sessionId);
		return this.write(terminalRecord, sessionId);
	}

	async read(id: string, sessionId: string): Promise<SubagentRecord | undefined> {
		const record = await readJsonObject(this.recordPath(id, sessionId));
		return record as unknown as SubagentRecord | undefined;
	}

	async list(sessionId: string): Promise<SubagentRecord[]> {
		let entries: string[];
		try {
			entries = await readdir(this.root(sessionId));
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") return [];
			throw error;
		}
		const records = await Promise.all(entries.map((entry) => this.read(entry, sessionId).catch(() => undefined)));
		return records
			.filter((record): record is SubagentRecord => record !== undefined)
			.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	}

	private root(sessionId: string): string {
		if (!sessionId.trim()) throw new Error("subagent records require a session id");
		return join(sessionStateDir(this.cwd, sessionId), "subagents");
	}

	private indexPath(sessionId: string): string {
		return join(this.root(sessionId), "index.jsonl");
	}

	private async writeArtifact(record: SubagentRecord, sessionId: string): Promise<void> {
		const artifactPath = record.artifact_file ?? this.artifactPath(record.id, sessionId);
		await writeJsonAtomic(artifactPath, {
			version: 1,
			subagentId: record.id,
			status: record.status,
			result_text: record.result_text,
			error_text: record.error_text,
			yield_result: record.yield_result,
			completed_at: record.completed_at,
		});
	}
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
	try {
		const raw = await readFile(path, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
		throw new Error("JSON file must contain an object");
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return undefined;
		if (error instanceof SyntaxError) throw new Error(error.message);
		throw error;
	}
}

async function appendJsonlAtomic(path: string, value: Record<string, unknown>): Promise<void> {
	await withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
	});
}

async function writeJsonAtomic(path: string, value: Record<string, unknown>): Promise<void> {
	await withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		const tempPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
		await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		await rename(tempPath, path);
	});
}
