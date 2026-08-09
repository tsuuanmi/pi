import { registerWorkflowHooks, type WorkflowHookHost } from "#workflows/hooks";
import type { WorkflowToolHost } from "#workflows/tool/host";
import { registerWorkflowTools } from "#workflows/tool/register";

export interface WorkflowHost extends WorkflowToolHost, WorkflowHookHost {}

export default function workflowExtension(host: WorkflowHost): void {
	registerWorkflowTools(host);
	registerWorkflowHooks(host);
}
