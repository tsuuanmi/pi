import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import type { InternetToolHost } from "#internet/tool/host";

export function registerStatusTools(host: InternetToolHost): void {
	host.registerTool({
		name: "internet_status",
		label: "Internet Status",
		description: "Show ChatGPT Web daemon health and active turn counts.",
		parameters: Type.Object({ account: Type.Optional(Type.String({ minLength: 1 })) }),
		async execute(_id, params, signal) {
			const account = await new AccountRegistry().get(params.account);
			const client = await DaemonClient.forAccount(account);
			const health = await client.health(signal);
			return {
				content: [{ type: "text", text: JSON.stringify({ endpoint: client.baseUrl(), ...health }, null, 2) }],
				details: { endpoint: client.baseUrl(), ...health },
			};
		},
	});
}
