export type InternetProviderId = "openai" | "anthropic" | "google";
export type InternetApiProviderId = Exclude<InternetProviderId, "openai">;
interface InternetAccountBase {
	id: string;
	provider: InternetProviderId;
	displayName: string;
	enabled: boolean;
}

export interface OpenAiInternetAccount extends InternetAccountBase {
	provider: "openai";
	configDir: string;
	host: string;
	port: number;
}

interface ApiInternetAccountBase extends InternetAccountBase {
	provider: InternetApiProviderId;
	apiKeyEnv: string;
}

export interface AnthropicInternetAccount extends ApiInternetAccountBase {
	provider: "anthropic";
}

export interface GoogleInternetAccount extends ApiInternetAccountBase {
	provider: "google";
}

export type ApiInternetAccount = AnthropicInternetAccount | GoogleInternetAccount;
export type InternetAccount = OpenAiInternetAccount | ApiInternetAccount;

interface InternetAccountInputBase {
	id: string;
	displayName?: string;
	enabled?: boolean;
}

export interface OpenAiInternetAccountInput extends InternetAccountInputBase {
	provider: "openai";
	configDir?: string;
	host?: string;
	port?: number;
}

export interface AnthropicInternetAccountInput extends InternetAccountInputBase {
	provider: "anthropic";
	apiKeyEnv: string;
}

export interface GoogleInternetAccountInput extends InternetAccountInputBase {
	provider: "google";
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
	return account.provider === "openai";
}
