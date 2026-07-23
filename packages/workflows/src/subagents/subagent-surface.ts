import type { WorkflowToolSurface } from "#workflows/skills/workflow-surface-types";

export const SUBAGENT_TOOLS: readonly WorkflowToolSurface[] = [
	{ skill: "subagent", toolName: "subagent_spawn" },
	{ skill: "subagent", toolName: "subagent_status" },
	{ skill: "subagent", toolName: "subagent_await" },
	{ skill: "subagent", toolName: "subagent_steer" },
	{ skill: "subagent", toolName: "subagent_pause" },
	{ skill: "subagent", toolName: "subagent_resume" },
	{ skill: "subagent", toolName: "subagent_cancel" },
	{ skill: "subagent", toolName: "subagent_inspect" },
	{ skill: "subagent", toolName: "subagent_attach" },
	{ skill: "subagent", toolName: "subagent_kill" },
] as const;
