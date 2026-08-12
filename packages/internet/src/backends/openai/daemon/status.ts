import type { ExtensionHudProvider } from "@tsuuanmi/pi/extensions";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import type { DaemonHealth } from "#internet/backends/openai/daemon/routes";

export interface DaemonStatus {
	available: boolean;
	endpoint?: string;
	health?: DaemonHealth;
	error?: string;
}

export async function readDaemonStatusSnapshot(): Promise<DaemonStatus> {
	try {
		const client = await DaemonClient.create();
		return { available: true, endpoint: client.baseUrl(), health: await client.health() };
	} catch (error) {
		return { available: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export const readDaemonStatus: ExtensionHudProvider = async () => {
	const status = await readDaemonStatusSnapshot();
	if (!status.available || !status.health) return undefined;
	const active = status.health.active_http_turns + status.health.active_browser_turns;
	return [
		{
			id: "internet",
			active: true,
			phase: status.health.accepting_turns ? "ready" : "draining",
			hud: {
				version: 1,
				chips: [
					{ label: "turns", value: String(active), priority: 20 },
					{ label: "state", value: status.health.accepting_turns ? "ready" : "draining", priority: 10 },
				],
			},
		},
	];
};
