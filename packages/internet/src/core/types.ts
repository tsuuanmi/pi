export type InternetBackendId = "openai" | "anthropic" | "google";
export type InternetApiBackendId = Exclude<InternetBackendId, "openai">;
export type InternetConversationMode = "temporary" | "durable";

interface InternetAccountBase {
	id: string;
	backend: InternetBackendId;
	displayName: string;
	enabled: boolean;
}

export interface OpenAiInternetAccount extends InternetAccountBase {
	backend: "openai";
	configDir: string;
	host: string;
	port: number;
	conversationMode: InternetConversationMode;
}

interface ApiInternetAccountBase extends InternetAccountBase {
	backend: InternetApiBackendId;
	apiKeyEnv: string;
}

export interface AnthropicInternetAccount extends ApiInternetAccountBase {
	backend: "anthropic";
}

export interface GoogleInternetAccount extends ApiInternetAccountBase {
	backend: "google";
}

export type ApiInternetAccount = AnthropicInternetAccount | GoogleInternetAccount;
export type InternetAccount = OpenAiInternetAccount | ApiInternetAccount;

interface InternetAccountInputBase {
	id: string;
	displayName?: string;
	enabled?: boolean;
}

export interface OpenAiInternetAccountInput extends InternetAccountInputBase {
	backend: "openai";
	configDir?: string;
	host?: string;
	port?: number;
	conversationMode?: InternetConversationMode;
}

export interface AnthropicInternetAccountInput extends InternetAccountInputBase {
	backend: "anthropic";
	apiKeyEnv: string;
}

export interface GoogleInternetAccountInput extends InternetAccountInputBase {
	backend: "google";
	apiKeyEnv: string;
}

export type InternetAccountInput =
	| OpenAiInternetAccountInput
	| AnthropicInternetAccountInput
	| GoogleInternetAccountInput;

export interface InternetSettings {
	autoLogin: boolean;
}

export type InternetControlAction = "drain" | "resume" | "shutdown" | "cancel-browser-turns";

export function isOpenAiAccount(account: InternetAccount): account is OpenAiInternetAccount {
	return account.backend === "openai";
}
