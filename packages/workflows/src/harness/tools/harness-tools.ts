import type { ExtensionAPI } from "@tsuuanmi/pi-agent-core";
import { createFetchToolDefinition } from "./fetch.ts";
import { createYieldToolDefinition } from "./yield.ts";

export function registerHarnessTools(pi: ExtensionAPI): void {
	// Subagent structured completion tool.
	// Available to subagent sessions for structured output.
	pi.registerTool(createYieldToolDefinition());

	// Additional high-ROI tools.
	pi.registerTool(createFetchToolDefinition());
}
