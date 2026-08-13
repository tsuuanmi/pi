import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";

export function registerAccountsTools(host: Pick<ExtensionAPI, "registerTool">): void {
	host.registerTool({
		name: "internet_accounts",
		label: "Internet Accounts",
		description: "List configured internet backend accounts.",
		parameters: Type.Object({}),
		async execute() {
			const accounts = await new AccountRegistry().list();
			return { content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }], details: { accounts } };
		},
	});

	host.registerTool({
		name: "internet_account_add",
		label: "Add Internet Account",
		description: "Add a ChatGPT Web daemon account. Reload Pi after changing accounts.",
		parameters: Type.Object({
			id: Type.String({ minLength: 1 }),
			displayName: Type.Optional(Type.String({ minLength: 1 })),
			configDir: Type.String({ minLength: 1 }),
			host: Type.Optional(Type.String({ minLength: 1 })),
			port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65_535 })),
			conversationMode: Type.Optional(Type.Union([Type.Literal("temporary"), Type.Literal("durable")])),
		}),
		async execute(_id, params) {
			const account = await new AccountRegistry().add(params);
			return {
				content: [{ type: "text", text: `Added ${account.id}. Reload Pi to register its provider.` }],
				details: account,
			};
		},
	});

	host.registerTool({
		name: "internet_account_set_enabled",
		label: "Set Internet Account",
		description: "Enable or disable an internet account. Reload Pi after changing accounts.",
		parameters: Type.Object({ id: Type.String({ minLength: 1 }), enabled: Type.Boolean() }),
		async execute(_id, params) {
			const account = await new AccountRegistry().setEnabled(params.id, params.enabled);
			return {
				content: [{ type: "text", text: `${account.id} ${account.enabled ? "enabled" : "disabled"}. Reload Pi.` }],
				details: account,
			};
		},
	});

	host.registerTool({
		name: "internet_account_conversation_mode",
		label: "Set Internet Conversation Mode",
		description:
			"Set an account to isolated Temporary Chat or canary-gated durable ChatGPT conversations. Reload Pi after changing accounts.",
		parameters: Type.Object({
			id: Type.String({ minLength: 1 }),
			mode: Type.Union([Type.Literal("temporary"), Type.Literal("durable")]),
		}),
		async execute(_id, params) {
			const account = await new AccountRegistry().setConversationMode(params.id, params.mode);
			return {
				content: [
					{ type: "text", text: `${account.id} conversation mode is ${account.conversationMode}. Reload Pi.` },
				],
				details: account,
			};
		},
	});
}
