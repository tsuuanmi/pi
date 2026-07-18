import { registerSkillTransitionTable } from "../shared/registry/skill-registry.ts";
import { runClosureCheckForSession } from "./deep-interview-runtime.ts";

function hasPendingQuestion(state: unknown): boolean {
	if (!state || typeof state !== "object" || Array.isArray(state)) return false;
	const record = state as Record<string, unknown>;
	if (record.has_pending_question === true || record.pending_question === true) return true;
	const orchestration =
		record.orchestration && typeof record.orchestration === "object" && !Array.isArray(record.orchestration)
			? (record.orchestration as Record<string, unknown>)
			: undefined;
	if (orchestration?.status === "waiting_for_answer") return true;
	const question = record.question ?? record.next_question ?? record.current_question;
	return typeof question === "string" && question.trim().length > 0;
}

registerSkillTransitionTable({
	skill: "deep-interview",
	interactive: true,
	blockingQuestionPhases: ["waiting_for_answer", "questioning"],
	terminalDetectors: [
		{
			id: "deep-interview-spec-artifact-present",
			kind: "filesystem",
			description: "Terminal when the harness observes a freshly written deep-interview spec artifact.",
		},
	],
	gateValidators: [
		{
			id: "deep-interview-closure-and-restate",
			description: "Fail-closed closure and restated-goal gates before spec finalization.",
			validate: async (context) => {
				if (!context.cwd || !context.sessionId) return { ok: true, blockers: [] };
				const state = context.state as Record<string, unknown> | undefined;
				if (!state || state.active === false) return { ok: true, blockers: [] };
				const result = await runClosureCheckForSession(context.cwd, context.sessionId);
				if (result.ok) return { ok: true, blockers: [] };
				return { ok: false, blockers: result.gaps.map((gap) => `closure-gap:${gap}`) };
			},
		},
	],
	selectNextRole: () => undefined,
	isQuestionBlocked: hasPendingQuestion,
});
