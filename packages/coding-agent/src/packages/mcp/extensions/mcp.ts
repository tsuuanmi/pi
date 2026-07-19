import type { ExtensionAPI } from "@tsuuanmi/pi-coding-agent/api/types";
import { MCPManager } from "#mcp/runtime/manager";

export default function mcpExtension(pi: ExtensionAPI): void {
	let manager: MCPManager | undefined;
	let unregisterProvider: (() => void) | undefined;

	pi.on("session_start", async (_event, ctx) => {
		if (manager) return;
		manager = new MCPManager({
			cwd: process.cwd(),
			isProjectTrusted: ctx.isProjectTrusted(),
		});
		manager.onToolsChanged((added, removed) => {
			for (const name of removed) {
				pi.unregisterTool(name);
			}
			for (const definition of added) {
				pi.registerTool(definition);
			}
			pi.refreshTools({ includeAllExtensionTools: true });
		});
		unregisterProvider = pi.registerMcpServerInfoProvider(() => manager?.getServerInfos() ?? []);
		await manager.initialize();
	});

	pi.on("session_shutdown", async () => {
		const current = manager;
		manager = undefined;
		unregisterProvider?.();
		unregisterProvider = undefined;
		if (current) await current.stopAll();
	});
}
