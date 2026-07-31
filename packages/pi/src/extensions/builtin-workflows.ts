import { registerWorkflows } from "@tsuuanmi/pi-workflows/register";
import type { ExtensionAPI } from "#pi/runtime/extension-types";

export default function builtinWorkflowsExtension(pi: ExtensionAPI): void {
	registerWorkflows(pi);
}
