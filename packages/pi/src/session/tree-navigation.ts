import { collectEntriesForBranchSummary, generateBranchSummary } from "#pi/compaction/index";
import type { SessionBeforeTreeResult, TreePreparation } from "#pi/extensions/index";
import type { AgentSessionContext } from "#pi/session/agent-session-context";
import type { BranchSummaryEntry } from "#pi/session/session-manager";

/**
 * Phase-1 TreeNavigation subsystem (stateless module functions on
 * `AgentSessionContext`). Extracted verbatim from `AgentSession.navigateTree`
 * (`agent-session.ts:2567`), `getUserMessagesForForking` (`:2758`), and
 * `_extractUserMessageText` (`:2775`, moved verbatim — the runtime duplicate at
 * `agent-session-runtime.ts` is module-private and behaviorally different, so
 * it is NOT imported). The public methods on `AgentSession` now delegate here.
 * `_getRequiredRequestAuth` stays on `AgentSession` (also called by the
 * core-loop) and is reached via `ctx.getRequiredRequestAuth`. Pure structural /
 * zero behavior change.
 */

export async function navigateTree(
	targetId: string,
	options: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
	ctx: AgentSessionContext,
): Promise<{ editorText?: string; cancelled: boolean; aborted?: boolean; summaryEntry?: BranchSummaryEntry }> {
	const oldLeafId = ctx.sessionManager.getLeafId();

	// No-op if already at target
	if (targetId === oldLeafId) {
		return { cancelled: false };
	}

	// Model required for summarization
	if (options.summarize && !ctx.model) {
		throw new Error("No model available for summarization");
	}

	const targetEntry = ctx.sessionManager.getEntry(targetId);
	if (!targetEntry) {
		throw new Error(`Entry ${targetId} not found`);
	}

	// Collect entries to summarize (from old leaf to common ancestor)
	const { entries: entriesToSummarize, commonAncestorId } = collectEntriesForBranchSummary(
		ctx.sessionManager,
		oldLeafId,
		targetId,
	);

	// Prepare event data - mutable so extensions can override
	let customInstructions = options.customInstructions;
	let replaceInstructions = options.replaceInstructions;
	let label = options.label;

	const preparation: TreePreparation = {
		targetId,
		oldLeafId,
		commonAncestorId,
		entriesToSummarize,
		userWantsSummary: options.summarize ?? false,
		customInstructions,
		replaceInstructions,
		label,
	};

	// Set up abort controller for summarization
	ctx.branchSummaryAbortController = new AbortController();

	try {
		let extensionSummary: { summary: string; details?: unknown } | undefined;
		let fromExtension = false;

		// Emit session_before_tree event
		if (ctx.extensionRunner.hasHandlers("session_before_tree")) {
			const result = (await ctx.extensionRunner.emit({
				type: "session_before_tree",
				preparation,
				signal: ctx.branchSummaryAbortController.signal,
			})) as SessionBeforeTreeResult | undefined;

			if (result?.cancel) {
				return { cancelled: true };
			}

			if (result?.summary && options.summarize) {
				extensionSummary = result.summary;
				fromExtension = true;
			}

			// Allow extensions to override instructions and label
			if (result?.customInstructions !== undefined) {
				customInstructions = result.customInstructions;
			}
			if (result?.replaceInstructions !== undefined) {
				replaceInstructions = result.replaceInstructions;
			}
			if (result?.label !== undefined) {
				label = result.label;
			}
		}

		// Run default summarizer if needed
		let summaryText: string | undefined;
		let summaryDetails: unknown;
		if (options.summarize && entriesToSummarize.length > 0 && !extensionSummary) {
			const model = ctx.model!;
			const { apiKey, headers, env } = await ctx.getRequiredRequestAuth(model);
			const branchSummarySettings = ctx.settingsManager.getBranchSummarySettings();
			const result = await generateBranchSummary(entriesToSummarize, {
				model,
				apiKey,
				headers,
				env,
				signal: ctx.branchSummaryAbortController.signal,
				customInstructions,
				replaceInstructions,
				reserveTokens: branchSummarySettings.reserveTokens,
				streamFn: ctx.streamFn,
			});
			if (result.aborted) {
				return { cancelled: true, aborted: true };
			}
			if (result.error) {
				throw new Error(result.error);
			}
			summaryText = result.summary;
			summaryDetails = {
				readFiles: result.readFiles || [],
				modifiedFiles: result.modifiedFiles || [],
			};
		} else if (extensionSummary) {
			summaryText = extensionSummary.summary;
			summaryDetails = extensionSummary.details;
		}

		// Determine the new leaf position based on target type
		let newLeafId: string | null;
		let editorText: string | undefined;

		if (targetEntry.type === "message" && targetEntry.message.role === "user") {
			// User message: leaf = parent (null if root), text goes to editor
			newLeafId = targetEntry.parentId;
			editorText = _extractUserMessageText(targetEntry.message.content);
		} else if (targetEntry.type === "custom_message") {
			// Custom message: leaf = parent (null if root), text goes to editor
			newLeafId = targetEntry.parentId;
			editorText =
				typeof targetEntry.content === "string"
					? targetEntry.content
					: targetEntry.content
							.filter((c): c is { type: "text"; text: string } => c.type === "text")
							.map((c) => c.text)
							.join("");
		} else {
			// Non-user message: leaf = selected node
			newLeafId = targetId;
		}

		// Switch leaf (with or without summary)
		// Summary is attached at the navigation target position (newLeafId), not the old branch
		let summaryEntry: BranchSummaryEntry | undefined;
		if (summaryText) {
			// Create summary at target position (can be null for root)
			const summaryId = ctx.sessionManager.branchWithSummary(newLeafId, summaryText, summaryDetails, fromExtension);
			summaryEntry = ctx.sessionManager.getEntry(summaryId) as BranchSummaryEntry;

			// Attach label to the summary entry
			if (label) {
				ctx.sessionManager.appendLabelChange(summaryId, label);
			}
		} else if (newLeafId === null) {
			// No summary, navigating to root - reset leaf
			ctx.sessionManager.resetLeaf();
		} else {
			// No summary, navigating to non-root
			ctx.sessionManager.branch(newLeafId);
		}

		// Attach label to target entry when not summarizing (no summary entry to label)
		if (label && !summaryText) {
			ctx.sessionManager.appendLabelChange(targetId, label);
		}

		// Update agent state
		const sessionContext = ctx.sessionManager.buildSessionContext();
		ctx.state.messages = sessionContext.messages;

		// Emit session_tree event
		await ctx.extensionRunner.emit({
			type: "session_tree",
			newLeafId: ctx.sessionManager.getLeafId(),
			oldLeafId,
			summaryEntry,
			fromExtension: summaryText ? fromExtension : undefined,
		});

		// Emit to custom tools

		return { editorText, cancelled: false, summaryEntry };
	} finally {
		ctx.branchSummaryAbortController = undefined;
	}
}

export function getUserMessagesForForking(ctx: AgentSessionContext): Array<{ entryId: string; text: string }> {
	const entries = ctx.sessionManager.getEntries();
	const result: Array<{ entryId: string; text: string }> = [];

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		if (entry.message.role !== "user") continue;

		const text = _extractUserMessageText(entry.message.content);
		if (text) {
			result.push({ entryId: entry.id, text });
		}
	}

	return result;
}

function _extractUserMessageText(content: string | Array<{ type: string; text?: string }>): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("");
	}
	return "";
}
