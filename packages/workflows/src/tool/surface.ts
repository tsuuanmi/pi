import { SUBAGENT_TOOL_NAMES } from "@tsuuanmi/pi";
import type { WorkflowToolSurface } from "#workflows/skills/workflow-surface-types";

export const SUBAGENT_SURFACES: readonly WorkflowToolSurface[] = SUBAGENT_TOOL_NAMES.map((toolName) => ({
	skill: "subagent",
	toolName,
}));
