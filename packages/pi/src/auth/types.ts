import type { OAuthCredentials } from "@tsuuanmi/pi-ai/oauth";

export interface ApiKeyCredential {
	type: "api_key";
	key: string;
	env?: Record<string, string>;
}

export type OAuthCredential = { type: "oauth" } & OAuthCredentials;

export interface BrowserCredential {
	type: "browser";
	profileId: string;
	tunnelSecret: string;
}

export type AuthCredential = ApiKeyCredential | OAuthCredential | BrowserCredential;

export interface AuthAccountCollection {
	active: string;
	accounts: Record<string, AuthCredential>;
}

export type AuthStorageEntry = AuthCredential | AuthAccountCollection;
export type AuthStorageData = Record<string, AuthStorageEntry>;

export interface AuthStatus {
	configured: boolean;
	source?: "stored" | "runtime" | "environment" | "settings_json_key" | "settings_json_command";
	label?: string;
}
