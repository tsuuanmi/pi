import { blockedMutationTargets, hasWorkflowStateTarget } from "#workflows/skills/deep-interview/mutation-paths";
import { extractMutationTargets, isMutatingBashCommand } from "#workflows/skills/deep-interview/mutation-targets";
import { readWorkflowActiveState } from "#workflows/state/active-state";

export const DEEP_INTERVIEW_MUTATION_BLOCK_MESSAGE =
	"Deep-interview phase boundary: continue gathering context/questions/risks and emit a spec or hand off before code edits. Mutation tools are blocked while deep-interview is active; finalize the spec with `pi workflow deep-interview write-spec` or hand off to an execution skill before mutating product code.";
export const WORKFLOW_STATE_MUTATION_BLOCK_MESSAGE =
	"`.pi` workflow state and artifacts are runtime-owned. Agent mutation tools cannot edit `.pi/**`; use the sanctioned `pi` workflow tools (e.g. `pi workflow deep-interview write-spec`) instead.";

const MUTATION_TOOLS = new Set(["edit", "write", "bash"]);

export interface MutationGuardInput {
	cwd: string;
	sessionId: string;
	toolName: string;
	input: Record<string, unknown>;
	forceOverride?: boolean;
	enforceWorkflowState?: boolean;
}

export type MutationGuardDecision =
	| { blocked: false; targets: string[] }
	| { blocked: true; message: string; targets: string[]; reason: string };

async function hasActiveInterview(cwd: string, sessionId: string): Promise<boolean> {
	const state = await readWorkflowActiveState(cwd, { sessionId });
	if (!state) return false;
	return state.active_workflows.some(
		(entry) =>
			entry.skill === "deep-interview" && entry.active === true && entry.phase?.trim().toLowerCase() !== "complete",
	);
}

export async function getDeepInterviewMutationDecision(input: MutationGuardInput): Promise<MutationGuardDecision> {
	if (!MUTATION_TOOLS.has(input.toolName)) return { blocked: false, targets: [] };
	const targets = extractMutationTargets(input.toolName, input.input);
	const shellMutation = input.toolName === "bash" && isMutatingBashCommand(input.input);
	const stateMutation = hasWorkflowStateTarget(input.cwd, targets);

	if (input.enforceWorkflowState !== false && stateMutation && (input.toolName !== "bash" || shellMutation)) {
		return {
			blocked: true,
			message: WORKFLOW_STATE_MUTATION_BLOCK_MESSAGE,
			targets: targets.paths,
			reason: "pi-state-target",
		};
	}
	if (!(await hasActiveInterview(input.cwd, input.sessionId)) || input.forceOverride) {
		return { blocked: false, targets: targets.paths };
	}
	if (input.toolName === "bash" && !shellMutation) return { blocked: false, targets: targets.paths };
	if (input.toolName === "bash" && targets.paths.length === 0) {
		return {
			blocked: true,
			message: DEEP_INTERVIEW_MUTATION_BLOCK_MESSAGE,
			targets: [],
			reason: "shell-mutation",
		};
	}
	if (targets.unknown) {
		return {
			blocked: true,
			message: DEEP_INTERVIEW_MUTATION_BLOCK_MESSAGE,
			targets: targets.paths,
			reason: "unknown-target",
		};
	}
	const blocked = await blockedMutationTargets(input.cwd, targets);
	if (blocked.length === 0) return { blocked: false, targets: targets.paths };
	return {
		blocked: true,
		message: DEEP_INTERVIEW_MUTATION_BLOCK_MESSAGE,
		targets: targets.paths,
		reason: "phase-boundary",
	};
}

export async function assertDeepInterviewMutationAllowed(input: MutationGuardInput): Promise<void> {
	const decision = await getDeepInterviewMutationDecision(input);
	if (decision.blocked) throw new Error(decision.message);
}
