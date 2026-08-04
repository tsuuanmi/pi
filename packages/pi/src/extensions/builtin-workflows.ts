import { registerWorkflows } from "@tsuuanmi/pi-workflows/register";
import type { ExtensionAPI } from "#pi/api/extension-types";
import { registerSubagentControls } from "#pi/subagents/tools";

export default function builtinWorkflowsExtension(pi: ExtensionAPI): void {
	registerWorkflows(pi);
	registerSubagentControls(pi);
}
