import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import type { InternetToolHost } from "#internet/tool/host";

export function registerControlTools(host: InternetToolHost): void {
	host.registerTool({
		name: "internet_control",
		label: "Internet Control",
		description: "Drain, resume, shut down, or cancel browser turns on the local ChatGPT Web daemon.",
		parameters: Type.Object({
			account: Type.Optional(Type.String({ minLength: 1 })),
			action: Type.Union([
				Type.Literal("drain"),
				Type.Literal("resume"),
				Type.Literal("shutdown"),
				Type.Literal("cancel-browser-turns"),
			]),
		}),
		async execute(_id, params, signal) {
			const account = await new AccountRegistry().get(params.account);
			const client = await DaemonClient.forAccount(account);
			const result = await client.control(params.action, signal);
			return {
				content: [{ type: "text", text: JSON.stringify(result ?? { status: "ok" }, null, 2) }],
				details: result,
			};
		},
	});
}
