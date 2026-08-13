import { readFile } from "node:fs/promises";
import { SubagentStore } from "#orchestrator/subagent/store";
import type { SubagentRecord } from "#orchestrator/subagent/types";

/**
 * Record lookup used by registered-tool preflight. It intentionally does not
 * call SubagentManager, so a protected re-entry cannot reach manager fallback.
 */
export class SubagentProtectionStore {
	private readonly store: SubagentStore;

	constructor(cwd: string) {
		this.store = new SubagentStore(cwd);
	}

	async read(id: string, sessionId: string): Promise<SubagentRecord | undefined> {
		return this.store.read(id, sessionId);
	}

	async isProtected(id: string, sessionId: string): Promise<boolean> {
		const record = await this.read(id, sessionId);
		if (!record) return false;
		return Boolean(
			record.protected_policy_id || record.agent_profile === "researcher" || record.role === "researcher",
		);
	}
}

export async function readProtectedRecord(
	cwd: string,
	id: string,
	sessionId: string,
): Promise<SubagentRecord | undefined> {
	return new SubagentProtectionStore(cwd).read(id, sessionId);
}

export async function recordFileIsProtected(path: string): Promise<boolean> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
		return Boolean(
			parsed.protected_policy_id === "pi-workflows/researcher-v1" ||
				parsed.agent_profile === "researcher" ||
				parsed.role === "researcher",
		);
	} catch {
		return false;
	}
}
