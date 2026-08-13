import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import { disableFullHarness, enableFullHarness, readHarnessConfig } from "#internet/daemon/harness";
import type { OwnedDaemonManager } from "#internet/daemon/manager";

export function registerHarnessTool(host: Pick<ExtensionAPI, "registerTool">, manager: OwnedDaemonManager): void {
	host.registerTool({
		name: "internet_harness",
		label: "Internet Harness",
		description: "Inspect or configure account-scoped local tools through the ChatGPT Web Full harness.",
		parameters: Type.Object({
			account: Type.Optional(Type.String({ minLength: 1 })),
			action: Type.Union([
				Type.Literal("status"),
				Type.Literal("enable"),
				Type.Literal("disable"),
				Type.Literal("restart"),
			]),
			tunnelClientPath: Type.Optional(Type.String({ minLength: 1 })),
			tunnelId: Type.Optional(Type.String({ pattern: "^tunnel_[a-f0-9]{32}$" })),
			runtimeKeyFile: Type.Optional(Type.String({ minLength: 1 })),
		}),
		async execute(_id, params) {
			const account = await new AccountRegistry().get(params.account);
			if (params.action === "enable") {
				if (!params.tunnelClientPath || !params.tunnelId || !params.runtimeKeyFile) {
					throw new Error("Full harness enable requires tunnelClientPath, tunnelId, and runtimeKeyFile.");
				}
				await enableFullHarness(account, {
					tunnelClientPath: params.tunnelClientPath,
					tunnelId: params.tunnelId,
					runtimeKeyFile: params.runtimeKeyFile,
				});
				await manager.restart(account.id);
			} else if (params.action === "disable") {
				await disableFullHarness(account);
				await manager.restart(account.id);
			} else if (params.action === "restart") {
				await manager.restart(account.id);
			}
			const config = await readHarnessConfig(account);
			const details = {
				account: account.id,
				mode: config.mode,
				connectorSetupRequired: config.mode === "full",
			};
			return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
		},
	});
}
