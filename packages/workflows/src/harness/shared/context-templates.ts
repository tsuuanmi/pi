export type ContextTemplateRalplanRole = "planner" | "architect" | "critic";

export interface RalplanContextTaskInput {
	role: ContextTemplateRalplanRole;
	runId: string;
	stage: string;
	stageN: number;
	deliberate?: boolean;
	plannerSubagentId?: string;
	attemptResume?: boolean;
	contextArtifacts?: string[];
	task: string;
}

const RALPLAN_BASE_CONTRACT = [
	"Ralplan workflow contract:",
	"- Produce planning/review artifacts only. Do not edit product files or execute implementation.",
	"- Persist the artifact by calling ralplan_write_artifact with the provided runId, stage, stageN, and full markdown artifact.",
	"- Return only the receipt/path plus compact status. Do not paste the full artifact after persistence.",
] as const;

export function buildRalplanRoleSystemPrompt(role: ContextTemplateRalplanRole): string {
	if (role === "planner") {
		return [
			...RALPLAN_BASE_CONTRACT,
			"- Planner artifacts must include problem statement, principles, decision drivers, viable options, recommendation, risks, verification plan, and open questions.",
		].join("\n");
	}
	if (role === "architect") {
		return [
			...RALPLAN_BASE_CONTRACT,
			"- Architect reviews must provide strongest steelman objection, tradeoff tensions, integration/ownership concerns, and synthesis or requested changes.",
			"- Compact verdict must include CLEAR, WATCH, or BLOCK; and APPROVE, COMMENT, or REQUEST CHANGES.",
		].join("\n");
	}
	return [
		...RALPLAN_BASE_CONTRACT,
		"- Critic reviews must evaluate acceptance criteria quality, risk mitigation clarity, testability, fair alternatives, and concrete verification steps.",
		"- Compact verdict must be APPROVE, ITERATE, or REJECT.",
	].join("\n");
}

export function buildRalplanTaskPrompt(input: RalplanContextTaskInput): string {
	const contextArtifacts = [...(input.contextArtifacts ?? [])];
	return [
		`Ralplan role: ${input.role}`,
		`Run id: ${input.runId}`,
		`Persist stage: ${input.stage}`,
		`Persist stageN: ${input.stageN}`,
		`Deliberate mode: ${input.deliberate === true}`,
		input.plannerSubagentId ? `Persisted Planner id: ${input.plannerSubagentId}` : "Persisted Planner id: none",
		input.attemptResume ? "Planner resume requested: true" : "Planner resume requested: false",
		contextArtifacts.length > 0
			? `Context artifacts:\n${contextArtifacts.map((item) => `- ${item}`).join("\n")}`
			: "Context artifacts: none",
		"",
		"Task:",
		input.task,
	].join("\n");
}
