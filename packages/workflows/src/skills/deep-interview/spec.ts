import { workflowStatePath } from "#workflows/session/session-layout";
import { runClosureAcceptanceGuard } from "#workflows/skills/deep-interview/closure";
import { mergeDeepInterviewEnvelope } from "#workflows/skills/deep-interview/envelope";
import type { DeepInterviewHandoff } from "#workflows/skills/deep-interview/guards";
import { deriveDeepInterviewHud } from "#workflows/skills/deep-interview/hud";
import { readDeepInterviewEnvelope, readRounds } from "#workflows/skills/deep-interview/store";
import { syncWorkflowActiveState } from "#workflows/state/active-state";
import { replaceWorkflowState } from "#workflows/state/workflow-state";

export async function assertDeepInterviewSpecReady(cwd: string, sessionId: string): Promise<void> {
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	const closure = runClosureAcceptanceGuard(envelope);
	if (!closure.ok) throw new Error(`deep-interview closure check failed: ${closure.gaps.join("; ")}`);
	if (typeof envelope.restated_goal !== "string" || envelope.restated_goal.trim() === "") {
		throw new Error("deep-interview restated goal is required before write-spec");
	}
	const latestScored = readRounds(envelope)
		.filter((round) => round.lifecycle === "scored")
		.at(-1);
	if (!latestScored || typeof latestScored.ambiguity !== "number" || !Number.isFinite(latestScored.ambiguity)) {
		throw new Error("deep-interview spec requires a scored round with finite ambiguity");
	}
	const threshold = envelope.threshold;
	if (typeof threshold !== "number") throw new Error("deep-interview threshold is required before write-spec");
	if (latestScored.ambiguity > threshold) {
		throw new Error(`deep-interview ambiguity ${latestScored.ambiguity} is above threshold ${threshold}`);
	}
}

export async function finalizeDeepInterviewSpecState(
	cwd: string,
	input: { slug: string; path: string; sha256: string; handoff: DeepInterviewHandoff },
	sessionId: string,
): Promise<{ statePath: string }> {
	if (!input.slug || input.slug.trim() !== input.slug) throw new Error("deep-interview spec slug is required");
	if (!input.path || input.path.trim() !== input.path) throw new Error("deep-interview spec path is required");
	if (!/^[a-f0-9]{64}$/u.test(input.sha256)) throw new Error("deep-interview spec sha256 is invalid");
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	const next = mergeDeepInterviewEnvelope(envelope, {
		active: input.handoff !== "stop",
		current_phase: input.handoff !== "stop" ? "handoff" : "complete",
		spec_slug: input.slug,
		spec_path: input.path,
		spec_sha256: input.sha256,
		handoff: input.handoff,
	});
	await replaceWorkflowState(cwd, "deep-interview", next, "pi deep-interview write-spec", { sessionId });
	// Target handoffs update active state atomically through applyHandoffToActiveState.
	if (input.handoff === "stop") {
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "deep-interview",
				active: false,
				phase: next.current_phase,
				state_path: workflowStatePath(cwd, "deep-interview", sessionId),
				hud: deriveDeepInterviewHud(next, {
					specStatus: "persisted",
					updatedAt: new Date().toISOString(),
				}),
			},
			{ sessionId },
		);
	}
	return { statePath: workflowStatePath(cwd, "deep-interview", sessionId) };
}
