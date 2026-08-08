import { SUBAGENT_TOOLS } from "@tsuuanmi/pi-agent";
import type { WorkflowToolSurface } from "#workflows/skills/workflow-surface-types";

export const SUBAGENT_SURFACES: readonly WorkflowToolSurface[] = SUBAGENT_TOOLS.map((tool) => ({
	skill: "subagent",
	toolName: tool.name,
}));
