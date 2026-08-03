import { registerWorkflows } from "@tsuuanmi/pi-workflows/register";
import type { ExtensionAPI } from "#pi/api/extension-types";

export default function builtinWorkflowsExtension(pi: ExtensionAPI): void {
	registerWorkflows(pi);
}
