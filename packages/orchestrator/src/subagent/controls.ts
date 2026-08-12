import type { ExtensionContext } from "@tsuuanmi/pi/extensions";
import { getSubagentManager } from "#orchestrator/subagent/registry";
import type { SubagentControls } from "#orchestrator/subagent/types";

export function requireSubagentControls(context: ExtensionContext): SubagentControls {
	return getSubagentManager(context);
}
