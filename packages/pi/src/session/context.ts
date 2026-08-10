import type { AgentMessage, ThinkingLevel } from "@tsuuanmi/pi-agent";
import { createBranchSummaryMessage, createCompactionSummaryMessage, createCustomMessage } from "@tsuuanmi/pi-agent";
import type { CompactionEntry, SessionContext, SessionEntry } from "#pi/session/types";

export function getLatestCompactionEntry(entries: readonly SessionEntry[]): CompactionEntry | null {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type === "compaction") return entry;
	}
	return null;
}

/** Build the model context by walking from the selected leaf to a root. */
export function buildSessionContext(entries: readonly SessionEntry[], leafId: string | null): SessionContext {
	if (leafId === null) return { messages: [], thinkingLevel: "off", model: null };

	const byId = new Map<string, SessionEntry>();
	for (const entry of entries) {
		if (byId.has(entry.id)) throw new Error(`Duplicate entry id ${entry.id}`);
		byId.set(entry.id, entry);
	}
	const leaf = byId.get(leafId);
	if (!leaf) throw new Error(`Entry ${leafId} not found`);

	const path: SessionEntry[] = [];
	const visited = new Set<string>();
	let current: SessionEntry = leaf;
	while (true) {
		if (visited.has(current.id)) throw new Error(`Cycle detected at entry ${current.id}`);
		visited.add(current.id);
		path.unshift(current);
		if (current.parentId === null) break;
		const parent = byId.get(current.parentId);
		if (!parent) throw new Error(`Parent entry ${current.parentId} not found`);
		current = parent;
	}

	let thinkingLevel: ThinkingLevel = "off";
	let model: { provider: string; modelId: string } | null = null;
	let compaction: CompactionEntry | null = null;

	for (const entry of path) {
		if (entry.type === "thinking_level_change") {
			thinkingLevel = entry.thinkingLevel;
		} else if (entry.type === "model_change") {
			model = { provider: entry.provider, modelId: entry.modelId };
		} else if (entry.type === "message" && entry.message.role === "assistant") {
			model = { provider: entry.message.provider, modelId: entry.message.model };
		} else if (entry.type === "compaction") {
			compaction = entry;
		}
	}

	const messages: AgentMessage[] = [];
	const appendMessage = (entry: SessionEntry): void => {
		if (entry.type === "message") {
			messages.push(entry.message);
		} else if (entry.type === "custom_message") {
			messages.push(
				createCustomMessage(entry.customType, entry.content, entry.display, entry.details, entry.timestamp),
			);
		} else if (entry.type === "branch_summary") {
			messages.push(createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp));
		}
	};

	if (!compaction) {
		for (const entry of path) appendMessage(entry);
		return { messages, thinkingLevel, model };
	}

	messages.push(createCompactionSummaryMessage(compaction.summary, compaction.tokensBefore, compaction.timestamp));
	const compactionIndex = path.findIndex((entry) => entry.id === compaction.id);
	const firstKeptIndex = path.findIndex((entry) => entry.id === compaction.firstKeptEntryId);
	if (firstKeptIndex < 0 || firstKeptIndex >= compactionIndex) {
		throw new Error(`Compaction entry ${compaction.id} has an invalid first kept entry`);
	}
	for (let index = firstKeptIndex; index < compactionIndex; index++) appendMessage(path[index]);
	for (let index = compactionIndex + 1; index < path.length; index++) appendMessage(path[index]);

	return { messages, thinkingLevel, model };
}
