import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import type { InternetAccountInput, InternetProviderId } from "#internet/core/types";

interface AddAccountParams {
	id: string;
	provider: InternetProviderId;
	displayName?: string;
	configDir?: string;
	host?: string;
	port?: number;
	enabled?: boolean;
	apiKeyEnv?: string;
}

function accountInput(params: AddAccountParams): InternetAccountInput {
	const common = { id: params.id, displayName: params.displayName, enabled: params.enabled };
	if (params.provider === "openai") {
		if (params.apiKeyEnv) throw new Error("apiKeyEnv is not valid for a ChatGPT Web account.");
		return {
			...common,
			provider: params.provider,
			configDir: params.configDir,
			host: params.host,
			port: params.port,
		};
	}
	if (!params.apiKeyEnv) throw new Error(`${params.provider} accounts require apiKeyEnv.`);
	if (params.configDir || params.host || params.port) {
		throw new Error(`Browser-daemon settings are not valid for ${params.provider} accounts.`);
	}
	return { ...common, provider: params.provider, apiKeyEnv: params.apiKeyEnv };
}

export function registerAccountsTools(host: Pick<ExtensionAPI, "registerTool">): void {
	host.registerTool({
		name: "internet_accounts",
		label: "Internet Accounts",
		description: "List configured ChatGPT Web, Anthropic API, and Gemini API accounts.",
		parameters: Type.Object({}),
		async execute() {
			const accounts = await new AccountRegistry().list();
			return { content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }], details: { accounts } };
		},
	});

	host.registerTool({
		name: "internet_account_add",
		label: "Internet Account Add",
		description: "Add an isolated browser or API account. Reload Pi after changing accounts.",
		parameters: Type.Object({
			id: Type.String({ minLength: 1 }),
			provider: Type.Union([Type.Literal("openai"), Type.Literal("anthropic"), Type.Literal("google")]),
			displayName: Type.Optional(Type.String({ minLength: 1 })),
			configDir: Type.Optional(Type.String({ minLength: 1 })),
			host: Type.Optional(Type.String({ minLength: 1 })),
			port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65_535 })),
			enabled: Type.Optional(Type.Boolean()),
			apiKeyEnv: Type.Optional(Type.String({ minLength: 1 })),
		}),
		async execute(_id, params) {
			const account = await new AccountRegistry().add(accountInput(params));
			return { content: [{ type: "text", text: JSON.stringify(account, null, 2) }], details: account };
		},
	});

	host.registerTool({
		name: "internet_account_remove",
		label: "Internet Account Remove",
		description: "Remove account routing metadata without deleting its private data directory.",
		parameters: Type.Object({ id: Type.String({ minLength: 1 }) }),
		async execute(_id, params) {
			await new AccountRegistry().remove(params.id);
			const result = { removed: params.id };
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
		},
	});

	host.registerTool({
		name: "internet_account_set_enabled",
		label: "Internet Account Enable",
		description: "Enable or disable an account. Reload Pi to refresh registered providers.",
		parameters: Type.Object({ id: Type.String({ minLength: 1 }), enabled: Type.Boolean() }),
		async execute(_id, params) {
			const account = await new AccountRegistry().setEnabled(params.id, params.enabled);
			return { content: [{ type: "text", text: JSON.stringify(account, null, 2) }], details: account };
		},
	});
}
