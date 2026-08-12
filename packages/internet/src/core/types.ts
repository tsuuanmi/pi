export type InternetBackendId = "openai";

export interface InternetAccount {
	id: string;
	backend: InternetBackendId;
	displayName: string;
	configDir: string;
	host: string;
	port: number;
	enabled: boolean;
}

export interface InternetAccountInput {
	id: string;
	backend?: InternetBackendId;
	displayName?: string;
	configDir: string;
	host?: string;
	port?: number;
	enabled?: boolean;
}

export interface InternetContext {
	cwd: string;
}

export type InternetControlAction = "drain" | "resume" | "shutdown" | "cancel-browser-turns";
