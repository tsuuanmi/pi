import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/daemon/client";
import type { OwnedDaemonManager } from "#internet/daemon/manager";

interface ConversationToolDetails {
	account: string;
	authority: boolean;
	action: "status" | "canary" | "reset";
}

export function registerConversationTool(host: Pick<ExtensionAPI, "registerTool">, manager: OwnedDaemonManager): void {
	host.registerTool({
		name: "internet_conversation",
		label: "Internet Conversation",
		description: "Inspect, canary-test, or reset canary-gated durable ChatGPT conversation state.",
		parameters: Type.Object({
			account: Type.Optional(Type.String({ minLength: 1 })),
			action: Type.Union([Type.Literal("status"), Type.Literal("canary"), Type.Literal("reset")]),
			confirm: Type.Optional(Type.Boolean()),
		}),
		async execute(_id, params, signal) {
			const account = await new AccountRegistry().getOpenAi(params.account);
			const stateDir = join(account.configDir, "conversations");
			if (params.action === "status") {
				const authority = await pathExists(join(stateDir, "authority.json"));
				const result: ConversationToolDetails = {
					account: account.id,
					authority,
					action: "status",
				};
				return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
			}
			if (params.confirm !== true) {
				throw new Error(`${params.action} requires confirm=true.`);
			}
			if (params.action === "reset") {
				await manager.stop(account.id);
				await rm(stateDir, { recursive: true, force: true });
				const result: ConversationToolDetails = {
					account: account.id,
					authority: false,
					action: "reset" as const,
				};
				return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
			}
			await manager.ensureReady(account.id);
			await (await DaemonClient.forAccount(account)).conversationCanary(signal);
			const result: ConversationToolDetails = {
				account: account.id,
				authority: true,
				action: "canary" as const,
			};
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
		},
	});
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}
