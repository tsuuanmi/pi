import type { ExtensionContext } from "#pi/api/context-types";
import { SubagentManager } from "#pi/subagents/manager";
import type { SubagentControls } from "#pi/subagents/types";

export function requireSubagentControls(context: ExtensionContext): SubagentControls {
	const manager = context.subagents;
	if (!manager) throw new Error("No subagent manager is available in this session.");
	if (!(manager instanceof SubagentManager)) {
		throw new Error("Pi subagent controls require the Pi SubagentManager.");
	}
	return manager;
}
