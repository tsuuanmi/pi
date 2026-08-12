import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import type { OwnedDaemonManager } from "#internet/daemon/manager";

export function registerDaemonTool(host: Pick<ExtensionAPI, "registerTool">, manager: OwnedDaemonManager): void {
	host.registerTool({
		name: "internet_daemon",
		label: "Internet Daemon",
		description: "Log in, start, stop, restart, or inspect the package-owned ChatGPT Web daemon.",
		parameters: Type.Object({
			account: Type.Optional(Type.String({ minLength: 1 })),
			action: Type.Union([
				Type.Literal("status"),
				Type.Literal("login"),
				Type.Literal("start"),
				Type.Literal("stop"),
				Type.Literal("restart"),
			]),
		}),
		async execute(_id, params) {
			const account = await new AccountRegistry().get(params.account);
			switch (params.action) {
				case "login":
					await manager.login(account.id);
					break;
				case "start":
					await manager.start(account.id);
					break;
				case "stop":
					await manager.stop(account.id);
					break;
				case "restart":
					await manager.restart(account.id);
					break;
				case "status":
					break;
			}
			const [status] = await manager.status(account.id);
			return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }], details: status };
		},
	});
}
