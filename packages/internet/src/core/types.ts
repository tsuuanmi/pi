export type InternetBackendId = "openai";
export type InternetConversationMode = "temporary" | "durable";

export interface InternetAccount {
	id: string;
	backend: InternetBackendId;
	displayName: string;
	configDir: string;
	host: string;
	port: number;
	enabled: boolean;
	conversationMode: InternetConversationMode;
}

export interface InternetAccountInput {
	id: string;
	backend?: InternetBackendId;
	displayName?: string;
	configDir: string;
	host?: string;
	port?: number;
	enabled?: boolean;
	conversationMode?: InternetConversationMode;
}

export interface InternetSettings {
	autoLogin: boolean;
}

export type InternetControlAction = "drain" | "resume" | "shutdown" | "cancel-browser-turns";
