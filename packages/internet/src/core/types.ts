export type InternetProviderId = "openai" | "anthropic" | "google" | "gemini-web";
export type InternetApiProviderId = Exclude<InternetProviderId, "openai" | "gemini-web">;
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

export interface GeminiWebInternetAccount extends InternetAccountBase {
	provider: "gemini-web";
	configDir: string;
	host: string;
	port: number;
}

export type BrowserInternetAccount = OpenAiInternetAccount | GeminiWebInternetAccount;

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
export type InternetAccount = OpenAiInternetAccount | GeminiWebInternetAccount | ApiInternetAccount;

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

export interface GeminiWebInternetAccountInput extends InternetAccountInputBase {
	provider: "gemini-web";
	configDir?: string;
	host?: string;
	port?: number;
}

export type InternetAccountInput =
	| OpenAiInternetAccountInput
	| AnthropicInternetAccountInput
	| GoogleInternetAccountInput
	| GeminiWebInternetAccountInput;

export interface InternetSettings {
	autoLogin: boolean;
}

export type InternetControlAction = "drain" | "resume" | "shutdown" | "cancel-browser-turns";

export function isOpenAiAccount(account: InternetAccount): account is OpenAiInternetAccount {
	return account.provider === "openai";
}

export function isGeminiWebAccount(account: InternetAccount): account is GeminiWebInternetAccount {
	return account.provider === "gemini-web";
}

export function isBrowserAccount(account: InternetAccount): account is BrowserInternetAccount {
	return isOpenAiAccount(account) || isGeminiWebAccount(account);
}
