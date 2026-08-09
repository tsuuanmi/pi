import { registerDeepInterviewTools } from "#workflows/skills/deep-interview/tools";
import { registerRalplanTools } from "#workflows/skills/ralplan/tools";
import { registerTeamTools } from "#workflows/skills/team/tools";
import { registerUltragoalTools } from "#workflows/skills/ultragoal/tools";
import type { WorkflowToolHost } from "#workflows/tool/host";
import { registerSubagentTools } from "#workflows/tool/subagent";

export function registerWorkflowTools(host: WorkflowToolHost): void {
	registerSubagentTools(host);
	registerDeepInterviewTools(host);
	registerRalplanTools(host);
	registerTeamTools(host);
	registerUltragoalTools(host);
}
