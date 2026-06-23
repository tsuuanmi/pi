import type { ExtensionAPI } from "@tsuuanmi/pi-coding-agent";

/**
 * Observe MCP tool calls and results.
 *
 * MCP tools are registered as normal Pi tools with names like:
 * `mcp__<server>__<tool>`.
 */
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event, ctx) => {
		if (!event.toolName.startsWith("mcp__")) return;
		ctx.ui.setStatus("mcp", `MCP: ${event.toolName}`);
	});

	pi.on("tool_result", (event, ctx) => {
		if (!event.toolName.startsWith("mcp__")) return;
		const status = event.isError ? "failed" : "ok";
		ctx.ui.notify(`MCP ${status}: ${event.toolName}`, event.isError ? "error" : "info");
	});
}
