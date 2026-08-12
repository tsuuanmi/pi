import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import type { InternetToolHost } from "#internet/tool/host";

export function registerAccountsTools(host: InternetToolHost): void {
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
}
