/**
 * Branch summarization for tree navigation.
 *
 * When navigating to a different point in the session tree, this generates
 * a summary of the branch being left so context isn't lost.
 */

import type { Message } from "@tsuuanmi/pi-agent";
import { computeFileLists, createFileOps, extractFileOpsFromMessage, formatFileOperations } from "@tsuuanmi/pi-agent";
import { entryToMessage } from "#pi/session/compaction/messages";
import { summarize, summaryText } from "#pi/session/compaction/summarize";
import { estimateTokens } from "#pi/session/compaction/tokens";
import type {
	BranchPreparation,
	BranchSummaryDetails,
	BranchSummaryResult,
	CollectEntriesResult,
	GenerateBranchSummaryOptions,
} from "#pi/session/compaction/types";
import type { ReadonlySessionManager, SessionEntry } from "#pi/session/manager";

// ============================================================================
// Entry Collection
// ============================================================================

/**
 * Collect entries that should be summarized when navigating from one position to another.
 *
 * Walks from oldLeafId back to the common ancestor with targetId, collecting entries
 * along the way. Does NOT stop at compaction boundaries - those are included and their
 * summaries become context.
 *
 * @param session - Session manager (read-only access)
 * @param oldLeafId - Current position (where we're navigating from)
 * @param targetId - Target position (where we're navigating to)
 * @returns Entries to summarize and the common ancestor
 */
export function collectEntriesForBranchSummary(
	session: ReadonlySessionManager,
	oldLeafId: string | null,
	targetId: string,
): CollectEntriesResult {
	// If no old position, nothing to summarize
	if (!oldLeafId) {
		return { entries: [], commonAncestorId: null };
	}

	// Find common ancestor (deepest node that's on both paths)
	const oldPath = new Set(session.getBranch(oldLeafId).map((e) => e.id));
	const targetPath = session.getBranch(targetId);

	// targetPath is root-first, so iterate backwards to find deepest common ancestor
	let commonAncestorId: string | null = null;
	for (let i = targetPath.length - 1; i >= 0; i--) {
		if (oldPath.has(targetPath[i].id)) {
			commonAncestorId = targetPath[i].id;
			break;
		}
	}

	// Collect entries from old leaf back to common ancestor
	const entries: SessionEntry[] = [];
	let current: string | null = oldLeafId;

	while (current && current !== commonAncestorId) {
		const entry = session.getEntry(current);
		if (!entry) break;
		entries.push(entry);
		current = entry.parentId;
	}

	// Reverse to get chronological order
	entries.reverse();

	return { entries, commonAncestorId };
}

/** Prepare branch messages, retaining the newest content within the token budget. */
export function prepareBranchEntries(entries: SessionEntry[], tokenBudget = 0): BranchPreparation {
	const messages: Message[] = [];
	const fileOps = createFileOps();
	let totalTokens = 0;

	for (const entry of entries) {
		if (entry.type !== "branch_summary" || entry.fromHook || !entry.details) continue;
		const details = entry.details as BranchSummaryDetails;
		if (Array.isArray(details.readFiles)) {
			for (const file of details.readFiles) fileOps.read.add(file);
		}
		if (Array.isArray(details.modifiedFiles)) {
			for (const file of details.modifiedFiles) fileOps.edited.add(file);
		}
	}

	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		const message = entryToMessage(entry, { includeToolResults: false });
		if (!message) continue;

		extractFileOpsFromMessage(message, fileOps);
		const tokens = estimateTokens(message);
		if (tokenBudget > 0 && totalTokens + tokens > tokenBudget) {
			if ((entry.type === "compaction" || entry.type === "branch_summary") && totalTokens < tokenBudget * 0.9) {
				messages.unshift(message);
				totalTokens += tokens;
			}
			break;
		}

		messages.unshift(message);
		totalTokens += tokens;
	}

	return { messages, fileOps, totalTokens };
}

// ============================================================================
// Summary Generation
// ============================================================================

const BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`;

const BRANCH_SUMMARY_PROMPT = `Create a structured summary of this conversation branch for context when returning later.

Use this EXACT format:

## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Work that was started but not finished]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [What should happen next to continue this work]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

/**
 * Generate a summary of abandoned branch entries.
 *
 * @param entries - Session entries to summarize (chronological order)
 * @param options - Generation options
 */
export async function generateBranchSummary(
	entries: SessionEntry[],
	options: GenerateBranchSummaryOptions,
): Promise<BranchSummaryResult> {
	const {
		model,
		apiKey,
		headers,
		env,
		signal,
		customInstructions,
		replaceInstructions,
		reserveTokens = 16384,
		stream,
	} = options;

	// Token budget = context window minus reserved space for prompt + response
	const contextWindow = model.contextWindow || 128000;
	const tokenBudget = contextWindow - reserveTokens;

	const { messages, fileOps } = prepareBranchEntries(entries, tokenBudget);

	if (messages.length === 0) {
		return { summary: "No content to summarize" };
	}

	let instructions: string;
	if (replaceInstructions && customInstructions) {
		instructions = customInstructions;
	} else if (customInstructions) {
		instructions = `${BRANCH_SUMMARY_PROMPT}\n\nAdditional focus: ${customInstructions}`;
	} else {
		instructions = BRANCH_SUMMARY_PROMPT;
	}

	const response = await summarize({
		model,
		messages,
		instructions,
		maxTokens: 2048,
		apiKey,
		headers,
		env,
		signal,
		stream,
	});
	if (response.stopReason === "aborted") return { aborted: true };
	if (response.stopReason === "error") return { error: response.errorMessage || "Summarization failed" };

	let summary = summaryText(response);

	// Prepend preamble to provide context about the branch summary
	summary = BRANCH_SUMMARY_PREAMBLE + summary;

	// Compute file lists and append to summary
	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	summary += formatFileOperations(readFiles, modifiedFiles);

	return {
		summary: summary || "No summary generated",
		readFiles,
		modifiedFiles,
	};
}
