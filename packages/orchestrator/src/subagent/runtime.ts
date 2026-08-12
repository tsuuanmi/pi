import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { registerSubagentTools } from "#orchestrator/subagent/lifecycle-tools";
import { disposeSubagentManager, getActiveSubagentCount } from "#orchestrator/subagent/registry";
import { registerSubagentControls } from "#orchestrator/subagent/tools";

export function registerSubagentRuntime(host: ExtensionAPI): void {
	registerSubagentTools(host);
	registerSubagentControls(host);
	host.registerHudProvider(async ({ cwd, sessionId }) => {
		const count = getActiveSubagentCount(cwd, sessionId);
		if (count === 0) return undefined;
		return [
			{
				id: "subagent",
				active: true,
				phase: "running",
				hud: {
					version: 1,
					chips: [{ label: "active", value: String(count), priority: 20 }],
				},
			},
		];
	});
	host.on("session_shutdown", async (_event, context) => {
		await disposeSubagentManager(context);
	});
}
