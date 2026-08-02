import { Type } from "typebox";
import { executeRole, resumeRole } from "#workflows/skills/team/team-coordinator";
import type { WorkflowToolHost } from "#workflows/tools/workflow-tools";

const agentSchema = Type.Object({
	id: Type.String({ description: "Unique runtime agent id." }),
	profile: Type.String({ description: "Configured agent profile name." }),
	capabilities: Type.Optional(Type.Array(Type.String({ description: "Agent capabilities." }))),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable." }))),
});

const teamExecuteSchema = Type.Object({
	teamId: Type.Optional(Type.String({ description: "Team id. Defaults to the active team." })),
	agents: Type.Array(agentSchema, { minItems: 1, description: "Explicit agents available to the orchestrator." }),
});

const teamResumeSchema = Type.Object({
	teamId: Type.Optional(Type.String({ description: "Team id. Defaults to the active team." })),
	runId: Type.String({ description: "Existing non-completed checkpoint run id." }),
	agents: Type.Array(agentSchema, { minItems: 1, description: "Explicit agents available to the orchestrator." }),
});

export function registerTeamTools(host: WorkflowToolHost): void {
	host.registerTool({
		name: "team_execute",
		label: "Execute Team",
		description: "Execute the next team role through the orchestrator.",
		promptSnippet: "Execute team through orchestrator",
		promptGuidelines: ["Use team_execute for every fresh team execution; direct subagent spawning is not supported."],
		parameters: teamExecuteSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeRole(params, ctx, signal),
	});
	host.registerTool({
		name: "team_resume",
		label: "Resume Team",
		description: "Resume the next team role from an existing orchestrator checkpoint.",
		promptSnippet: "Resume team through orchestrator",
		promptGuidelines: ["Use team_resume only with an existing non-completed checkpoint run id."],
		parameters: teamResumeSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => resumeRole(params, ctx, signal),
	});
}
