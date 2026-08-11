import { randomUUID } from "node:crypto";
import { withFileMutationQueue } from "@tsuuanmi/pi-agent/node";
import { assertTransition, buildStateView, nextAllowedActions } from "#workflows/runtime/lifecycle";
import {
	ReceiptConsistencyError,
	validateReceiptFamilyConsistency,
	workflowRuntimeReceiptHash,
} from "#workflows/runtime/receipt-rules";
import {
	appendRuntimeEvent,
	appendWorkflowRuntimeReceipt,
	readRuntimeEvents,
	readSessionState,
	sessionPaths,
	writeSessionState,
} from "#workflows/runtime/storage";
import type {
	HarnessVerb,
	RuntimeSeverity,
	RuntimeWriter,
	SessionState,
	WorkflowRuntimeEvent,
	WorkflowRuntimeReceipt,
} from "#workflows/runtime/types";

interface RuntimeMutationEventInput {
	kind: string;
	severity?: RuntimeSeverity;
	evidence?: Record<string, unknown>;
}

export interface RuntimeMutationInput {
	root: string;
	sessionId: string;
	verb: HarnessVerb;
	writer: RuntimeWriter;
	accepted?: boolean;
	nextState: SessionState;
	events?: RuntimeMutationEventInput[];
	evidence?: Record<string, unknown>;
	ownerLive?: boolean;
}

export interface RuntimeMutationResult {
	state: SessionState;
	events: WorkflowRuntimeEvent[];
	receipt: WorkflowRuntimeReceipt;
}

export async function mutateRuntimeSession(input: RuntimeMutationInput): Promise<RuntimeMutationResult> {
	const lockPath = `${sessionPaths(input.root, input.sessionId).dir}/.mutation`;
	return withFileMutationQueue(lockPath, async () => {
		const current = await readSessionState(input.root, input.sessionId);
		if (current) assertTransition(current.lifecycle, input.nextState.lifecycle);

		const eventLog = await readRuntimeEvents(input.root, input.sessionId, 0);
		if (eventLog.diagnostics.length > 0) {
			throw new Error(`runtime event log is corrupt: ${eventLog.diagnostics[0]?.message ?? "unknown"}`);
		}

		const ownerLive = input.ownerLive ?? false;
		const stateBefore = current ? buildStateView(current, ownerLive) : undefined;
		const stateAfter = buildStateView(input.nextState, ownerLive);
		let cursor = eventLog.maxCursor;
		const now = new Date().toISOString();
		const events = (input.events ?? []).map(
			(event) =>
				({
					schemaVersion: 1 as const,
					eventId: randomUUID(),
					cursor: ++cursor,
					createdAt: now,
					severity: event.severity ?? "info",
					kind: event.kind,
					state: stateAfter,
					evidence: event.evidence ?? {},
					nextAllowedActions: nextAllowedActions(input.nextState.lifecycle, ownerLive),
					writer: input.writer,
				}) satisfies WorkflowRuntimeEvent,
		);

		const receiptSeed = {
			schemaVersion: 1 as const,
			receiptId: randomUUID(),
			sessionId: input.sessionId,
			verb: input.verb,
			accepted: input.accepted !== false,
			createdAt: now,
			writer: input.writer,
			stateBefore,
			stateAfter,
			eventCursorRange:
				events.length > 0 ? { from: events[0]?.cursor ?? cursor, to: events.at(-1)?.cursor ?? cursor } : undefined,
			evidence: input.evidence ?? {},
		};
		const receipt: WorkflowRuntimeReceipt = {
			...receiptSeed,
			contentSha256: workflowRuntimeReceiptHash(receiptSeed),
		};

		// Validate lifecycle-target consistency before any event, receipt, or state write.
		const consistency = validateReceiptFamilyConsistency(receipt);
		if (!consistency.valid) throw new ReceiptConsistencyError(receipt, consistency.contradiction ?? "unknown");

		for (const event of events) await appendRuntimeEvent(input.root, input.sessionId, event);
		await appendWorkflowRuntimeReceipt(input.root, input.sessionId, receipt);
		await writeSessionState(input.root, input.nextState);
		return { state: input.nextState, events, receipt };
	});
}
