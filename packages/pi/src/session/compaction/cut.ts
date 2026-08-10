import { estimateTokens } from "#pi/session/compaction/tokens";
import type { CutPointResult } from "#pi/session/compaction/types";
import type { SessionEntry } from "#pi/session/types";

function validCutPoints(entries: SessionEntry[], start: number, end: number): number[] {
	const points: number[] = [];
	for (let i = start; i < end; i++) {
		const entry = entries[i];
		if (entry.type === "message") {
			switch (entry.message.role) {
				case "bashExecution":
				case "custom":
				case "branchSummary":
				case "compactionSummary":
				case "user":
				case "assistant":
					points.push(i);
					break;
				case "toolResult":
					break;
			}
		}

		if (entry.type === "branch_summary" || entry.type === "custom_message") points.push(i);
	}
	return points;
}

/** Find the user or bash-execution entry that starts the turn at an index. */
export function findTurnStartIndex(entries: SessionEntry[], entryIndex: number, start: number): number {
	for (let i = entryIndex; i >= start; i--) {
		const entry = entries[i];
		if (entry.type === "branch_summary" || entry.type === "custom_message") return i;
		if (entry.type === "message" && (entry.message.role === "user" || entry.message.role === "bashExecution")) {
			return i;
		}
	}
	return -1;
}

/** Find the first entry to keep while preserving message and turn boundaries. */
export function findCutPoint(
	entries: SessionEntry[],
	start: number,
	end: number,
	keepRecentTokens: number,
): CutPointResult {
	const points = validCutPoints(entries, start, end);
	if (points.length === 0) return { firstKeptEntryIndex: start, turnStartIndex: -1, isSplitTurn: false };

	let accumulated = 0;
	let cut = points[0];
	for (let i = end - 1; i >= start; i--) {
		const entry = entries[i];
		if (entry.type !== "message") continue;

		accumulated += estimateTokens(entry.message);
		if (accumulated < keepRecentTokens) continue;

		for (const point of points) {
			if (point >= i) {
				cut = point;
				break;
			}
		}
		break;
	}

	while (cut > start) {
		const previous = entries[cut - 1];
		if (previous.type === "compaction" || previous.type === "message") break;
		cut--;
	}

	const entry = entries[cut];
	const isUser = entry.type === "message" && entry.message.role === "user";
	const turnStart = isUser ? -1 : findTurnStartIndex(entries, cut, start);

	return {
		firstKeptEntryIndex: cut,
		turnStartIndex: turnStart,
		isSplitTurn: !isUser && turnStart !== -1,
	};
}
