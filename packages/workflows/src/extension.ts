import { registerWorkflowHooks, type WorkflowHookHost } from "#workflows/hooks";
import { registerWorkflowTools, type WorkflowToolHost } from "#workflows/tools";

export interface WorkflowHost extends WorkflowToolHost, WorkflowHookHost {}

export default function workflowExtension(host: WorkflowHost): void {
	registerWorkflowTools(host);
	registerWorkflowHooks(host);
}
