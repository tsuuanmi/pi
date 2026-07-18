import type { ExtensionContext } from "@tsuuanmi/pi-agent";

export function syncMcpHudUi(ctx: ExtensionContext): void {
	const infos = ctx.getMcpServerInfos();
	if (infos.length === 0) {
		ctx.ui.setStatus("mcp", undefined);
		ctx.ui.setWidget("mcp", undefined);
		return;
	}
	const connected = infos.filter((info) => info.status === "connected");
	const failed = infos.filter((info) => info.status === "failed");
	const disconnected = infos.filter((info) => info.status === "disconnected");
	const toolCount = infos.reduce((sum, info) => sum + info.toolCount, 0);
	const summary = [
		`MCP ${connected.length}/${infos.length}`,
		`${toolCount} tool${toolCount === 1 ? "" : "s"}`,
		...(failed.length > 0 ? [`${failed.length} failed`] : []),
		...(disconnected.length > 0 ? [`${disconnected.length} disconnected`] : []),
	].join(" | ");
	ctx.ui.setStatus("mcp", summary);
	if (ctx.mode !== "tui") return;
	const lines = infos.map((info) => {
		const suffix = info.error ? ` — ${info.error}` : ` — ${info.toolCount} tool${info.toolCount === 1 ? "" : "s"}`;
		return `${info.name}: ${info.status}${suffix}`;
	});
	ctx.ui.setWidget("mcp", ["MCP", ...lines], { placement: "aboveEditor" });
}

export async function syncWorkflowHudUi(_ctx: ExtensionContext): Promise<void> {
	// The workflow HUD now renders from StatusLineComponent's background-refreshed
	// active-state cache. Keep these hook registrations for lifecycle coverage,
	// but do not mirror workflow data into extension status/widget slots.
}
