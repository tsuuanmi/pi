import { registerWorkflowHooks, type WorkflowHookHost } from "#workflows/hooks";
import { registerWorkflowTools, type WorkflowToolHost } from "#workflows/tools/workflow-tools";

export interface WorkflowHost extends WorkflowToolHost, WorkflowHookHost {}

export function registerWorkflows(host: WorkflowHost): void {
	registerWorkflowTools(host);
	registerWorkflowHooks(host);
}
