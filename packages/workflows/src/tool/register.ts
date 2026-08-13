import { registerDeepInterviewTools } from "#workflows/skills/deep-interview/tools";
import { registerTeamTools } from "#workflows/skills/team/tools";
import type { WorkflowToolHost } from "#workflows/tool/host";

export function registerWorkflowTools(host: WorkflowToolHost): void {
	registerDeepInterviewTools(host);
	registerTeamTools(host);
}
