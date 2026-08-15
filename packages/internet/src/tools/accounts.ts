import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import type { InternetAccountInput, InternetBackendId } from "#internet/core/types";

interface AddAccountParams {
	id: string;
	backend: InternetBackendId;
	displayName?: string;
	configDir?: string;
	host?: string;
	port?: number;
	enabled?: boolean;
	conversationMode?: "temporary" | "durable";
	apiKeyEnv?: string;
}

function accountInput(params: AddAccountParams): InternetAccountInput {
	const common = { id: params.id, displayName: params.displayName, enabled: params.enabled };
	if (params.backend === "openai") {
		if (params.apiKeyEnv) throw new Error("apiKeyEnv is not valid for a ChatGPT Web account.");
		return {
			...common,
			backend: params.backend,
			configDir: params.configDir,
			host: params.host,
			port: params.port,
			conversationMode: params.conversationMode,
		};
	}
	if (!params.apiKeyEnv) throw new Error(`${params.backend} accounts require apiKeyEnv.`);
	if (params.configDir || params.host || params.port || params.conversationMode) {
		throw new Error(`Browser-daemon settings are not valid for ${params.backend} accounts.`);
	}
	return { ...common, backend: params.backend, apiKeyEnv: params.apiKeyEnv };
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
			backend: Type.Union([Type.Literal("openai"), Type.Literal("anthropic"), Type.Literal("google")]),
			displayName: Type.Optional(Type.String({ minLength: 1 })),
			configDir: Type.Optional(Type.String({ minLength: 1 })),
			host: Type.Optional(Type.String({ minLength: 1 })),
			port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65_535 })),
			enabled: Type.Optional(Type.Boolean()),
			conversationMode: Type.Optional(Type.Union([Type.Literal("temporary"), Type.Literal("durable")])),
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

	host.registerTool({
		name: "internet_account_conversation_mode",
		label: "Internet Account Conversation Mode",
		description: "Set temporary or durable ChatGPT Web conversation mode for one account.",
		parameters: Type.Object({
			id: Type.String({ minLength: 1 }),
			mode: Type.Union([Type.Literal("temporary"), Type.Literal("durable")]),
		}),
		async execute(_id, params) {
			const account = await new AccountRegistry().setConversationMode(params.id, params.mode);
			return { content: [{ type: "text", text: JSON.stringify(account, null, 2) }], details: account };
		},
	});
}
