import type { ExtensionAPI, ExtensionContext, ExtensionToolSpec } from "@tsuuanmi/pi/extensions";
import { getSubagentManager, registerSubagentRuntime } from "@tsuuanmi/pi-orchestrator";
import type { TSchema } from "typebox";
import { registerWorkflowHooks } from "#workflows/hooks";
import { readWorkflowHudEntries } from "#workflows/state/hud";
import type { WorkflowContext } from "#workflows/tool/context";
import type { WorkflowToolHost } from "#workflows/tool/host";
import { registerWorkflowTools } from "#workflows/tool/register";
import type { WorkflowToolSpec } from "#workflows/tool/spec";

function workflowContext(context: ExtensionContext): WorkflowContext {
	return {
		cwd: context.cwd,
		sessionManager: context.sessionManager,
		subagent: getSubagentManager(context),
		model: context.model,
	};
}

function workflowToolHost(host: ExtensionAPI): WorkflowToolHost {
	return {
		registerTool<TParams extends TSchema, TDetails>(tool: WorkflowToolSpec<TParams, TDetails>) {
			const extensionTool: ExtensionToolSpec<TParams, TDetails> = {
				...tool,
				execute: (id, params, signal, onUpdate, context) =>
					tool.execute(id, params, signal, onUpdate, workflowContext(context)),
			};
			host.registerTool(extensionTool);
		},
	};
}

export default function workflowExtension(host: ExtensionAPI): void {
	registerSubagentRuntime(host);
	registerWorkflowTools(workflowToolHost(host));
	registerWorkflowHooks(host);
	host.registerHudProvider(readWorkflowHudEntries);
}
