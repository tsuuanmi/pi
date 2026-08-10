import type { StatusLineHudEntryReader } from "@tsuuanmi/pi-tui";
import { registerWorkflowHooks, type WorkflowHookHost } from "#workflows/hooks";
import { readWorkflowHudEntries } from "#workflows/state/hud";
import type { WorkflowToolHost } from "#workflows/tool/host";
import { registerWorkflowTools } from "#workflows/tool/register";

export interface WorkflowHost extends WorkflowToolHost, WorkflowHookHost {
	registerHudProvider(provider: StatusLineHudEntryReader): void;
}

export default function workflowExtension(host: WorkflowHost): void {
	registerWorkflowTools(host);
	registerWorkflowHooks(host);
	host.registerHudProvider(readWorkflowHudEntries);
}
