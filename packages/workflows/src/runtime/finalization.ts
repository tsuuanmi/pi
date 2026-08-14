import { evaluateGates, evaluateTerminalDetectors } from "#workflows/policy/skill-policy";
import type { WorkflowSkill } from "#workflows/registry/workflow-manifest-types";
import { buildResponse } from "#workflows/runtime/lifecycle";
import { mutateRuntimeSession } from "#workflows/runtime/mutation";
import type { PrimitiveResponse, RuntimeWriter, SessionState, WorkflowRuntimeReceipt } from "#workflows/runtime/types";
import { findValidationReceipt, markersMatch } from "#workflows/runtime/validation";
import { buildWorkspaceMarker } from "#workflows/runtime/workspace-marker";
import { readWorkflowState } from "#workflows/state/workflow-state";

function inputString(input: Record<string, unknown>, key: string): string | undefined {
	const value = input[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inputWorkflowSkill(input: Record<string, unknown>): WorkflowSkill | undefined {
	const value = inputString(input, "skill");
	if (value === "deep-interview" || value === "ralplan" || value === "team" || value === "ultragoal") return value;
	return undefined;
}

export async function finalize(opts: {
	root: string;
	state: SessionState;
	ownerLive: boolean;
	input: Record<string, unknown>;
	writer: RuntimeWriter;
	receipts: WorkflowRuntimeReceipt[];
}): Promise<PrimitiveResponse> {
	const selected = findValidationReceipt(opts.receipts, opts.state, opts.input);
	const currentMarker = buildWorkspaceMarker(opts.state.handle.workspace, opts.state.handle.base);
	const blockers: string[] = [];
	const skill = inputWorkflowSkill(opts.input);
	let terminalMatched: string[] = [];
	if (skill) {
		const workspace = opts.state.handle.workspace;
		if (!workspace) {
			blockers.push("gate-read-error:missing-workspace");
		} else {
			const terminal = evaluateTerminalDetectors({
				skill,
				state: undefined,
				sessionId: opts.state.sessionId,
				cwd: workspace,
				input: opts.input,
				receipts: opts.receipts,
			});
			terminalMatched = terminal.matched;
			if (!terminal.ok) blockers.push(...terminal.blockers);
			const skillState = await readWorkflowState(workspace, skill, { sessionId: opts.state.sessionId }).catch(
				() => undefined,
			);
			const gates = await evaluateGates({
				skill,
				state: skillState,
				sessionId: opts.state.sessionId,
				cwd: workspace,
				input: opts.input,
				receipts: opts.receipts,
			});
			if (!gates.ok) blockers.push(...gates.blockers);
		}
	}
	if (!selected) blockers.push("validation-receipt-missing-or-ambiguous");
	if (selected && !selected.valid) blockers.push("validation-receipt-invalid");
	if (selected?.evidence && !selected.evidence.overallPassed) blockers.push("validation-not-passing");
	if (selected?.evidence && !markersMatch(currentMarker, selected.evidence.workspaceMarker))
		blockers.push("validation-stale-workspace-marker");
	if (blockers.length > 0) {
		const next: SessionState = { ...opts.state, lifecycle: "blocked", blockers, updatedAt: new Date().toISOString() };
		const mutation = await mutateRuntimeSession({
			root: opts.root,
			sessionId: opts.state.sessionId,
			verb: "finalize",
			writer: opts.writer,
			accepted: false,
			nextState: next,
			ownerLive: opts.ownerLive,
			events: [{ kind: "finalize_blocked", severity: "critical", evidence: { blockers } }],
			evidence: { blockers, validation: selected, currentMarker, skill, terminalMatched },
		});
		return buildResponse(mutation.state, opts.ownerLive, { blockers, receipt: mutation.receipt }, false);
	}
	const next: SessionState = {
		...opts.state,
		lifecycle: "completed",
		blockers: [],
		updatedAt: new Date().toISOString(),
	};
	const mutation = await mutateRuntimeSession({
		root: opts.root,
		sessionId: opts.state.sessionId,
		verb: "finalize",
		writer: opts.writer,
		nextState: next,
		ownerLive: opts.ownerLive,
		events: [{ kind: "finalize_completed", evidence: { validationReceiptId: selected?.receiptId } }],
		evidence: {
			validationReceiptId: selected?.receiptId,
			validationReceiptSha256: selected?.contentSha256,
			currentMarker,
			skill,
			terminalMatched,
		},
	});
	return buildResponse(mutation.state, opts.ownerLive, {
		completed: true,
		receipt: mutation.receipt,
		skill,
		terminalMatched,
	});
}
