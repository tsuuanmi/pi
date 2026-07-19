import type { Api, Model } from "#ai/types";

export type OAuthCredentials = {
	refresh: string;
	access: string;
	expires: number;
	[key: string]: unknown;
};

export type OAuthProviderId = string;

/** @deprecated Use OAuthProviderId instead */
export type OAuthProvider = OAuthProviderId;

export type OAuthPrompt = {
	message: string;
	placeholder?: string;
	allowEmpty?: boolean;
};

export type OAuthAuthInfo = {
	url: string;
	instructions?: string;
};

export type OAuthDeviceCodeInfo = {
	userCode: string;
	verificationUri: string;
	intervalSeconds?: number;
	expiresInSeconds?: number;
};

export type OAuthSelectOption = {
	id: string;
	label: string;
};

export type OAuthSelectPrompt = {
	message: string;
	options: OAuthSelectOption[];
};

export interface OAuthLoginCallbacks {
	onAuth: (info: OAuthAuthInfo) => void;
	onDeviceCode: (info: OAuthDeviceCodeInfo) => void;
	onPrompt: (prompt: OAuthPrompt) => Promise<string>;
	onProgress?: (message: string) => void;
	onManualCodeInput?: () => Promise<string>;
	/** Show an interactive selector and return the selected option id, or undefined on cancel. */
	onSelect: (prompt: OAuthSelectPrompt) => Promise<string | undefined>;
	signal?: AbortSignal;
}

export interface OAuthProviderInterface {
	readonly id: OAuthProviderId;
	readonly name: string;

	/** Run the login flow, return credentials to persist */
	login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;

	/** Whether login uses a local callback server and supports manual code input. */
	usesCallbackServer?: boolean;

	/** Refresh expired credentials, return updated credentials to persist */
	refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;

	/** Convert credentials to API key string for the provider */
	getApiKey(credentials: OAuthCredentials): string;

	/** Optional: modify models for this provider (e.g., update baseUrl) */
	modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[];
}

/** @deprecated Use OAuthProviderInterface instead */
export interface OAuthProviderInfo {
	id: OAuthProviderId;
	name: string;
	available: boolean;
}

export interface OAuthAuthorizationInput {
	code?: string;
	state?: string;
}

export function parseOAuthAuthorizationInput(input: string): OAuthAuthorizationInput {
	const value = input.trim();
	if (!value) return {};

	try {
		const url = new URL(value);
		return {
			code: url.searchParams.get("code") ?? undefined,
			state: url.searchParams.get("state") ?? undefined,
		};
	} catch {
		// not a URL
	}

	if (value.includes("#")) {
		const [code, state] = value.split("#", 2);
		return { code, state };
	}

	if (value.includes("code=")) {
		const params = new URLSearchParams(value);
		return {
			code: params.get("code") ?? undefined,
			state: params.get("state") ?? undefined,
		};
	}

	return { code: value };
}

function base64urlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
	const verifierBytes = new Uint8Array(32);
	crypto.getRandomValues(verifierBytes);
	const verifier = base64urlEncode(verifierBytes);

	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const challenge = base64urlEncode(new Uint8Array(hashBuffer));

	return { verifier, challenge };
}
