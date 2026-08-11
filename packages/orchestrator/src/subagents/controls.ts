import type { ExtensionContext } from "@tsuuanmi/pi/extensions";
import { getSubagentManager } from "#orchestrator/subagents/registry";
import type { SubagentControls } from "#orchestrator/subagents/types";

export function requireSubagentControls(context: ExtensionContext): SubagentControls {
	return getSubagentManager(context);
}
