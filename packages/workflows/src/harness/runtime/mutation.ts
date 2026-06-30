import { createHash, randomUUID } from "node:crypto";
import { withFileMutationQueue } from "@tsuuanmi/pi-agent/node";
import { ReceiptConsistencyError, validateReceiptFamilyConsistency } from "./receipt-rules.ts";
import { assertTransition, buildStateView, nextAllowedActions } from "./state.ts";
import {
	appendRuntimeEvent,
	appendRuntimeReceipt,
	readRuntimeEvents,
	readSessionState,
	sessionPaths,
	writeSessionState,
} from "./storage.ts";
import type {
	HarnessVerb,
	RuntimeReceipt,
	RuntimeSeverity,
	RuntimeWriter,
	SessionState,
	WorkflowRuntimeEvent,
} from "./types.ts";

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
	receipt: RuntimeReceipt;
}

function sha256Json(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
		const receipt: RuntimeReceipt = { ...receiptSeed, contentSha256: sha256Json(receiptSeed) };

		// Phase 3 receipt lifecycle-target consistency guard. Runs AFTER the in-memory receipt is
		// constructed and BEFORE any write so a contradiction throws with zero orphan writes (no
		// events/receipts/state are appended for an invalid receipt). Write-path only; pre-Phase-3
		// receipts are grandfathered and not re-validated on read.
		const consistency = validateReceiptFamilyConsistency(receipt);
		if (!consistency.valid) throw new ReceiptConsistencyError(receipt, consistency.contradiction ?? "unknown");

		for (const event of events) await appendRuntimeEvent(input.root, input.sessionId, event);
		await appendRuntimeReceipt(input.root, input.sessionId, receipt);
		await writeSessionState(input.root, input.nextState);
		return { state: input.nextState, events, receipt };
	});
}
