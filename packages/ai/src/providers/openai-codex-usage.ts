import type { Api, Model } from "../types.ts";

const CODEX_USAGE_PATH = "wham/usage";
const JWT_AUTH_CLAIM = "https://api.openai.com/auth";
const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api";

const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;
const ONE_WEEK_SECONDS = 7 * ONE_DAY_SECONDS;
const USAGE_CACHE_TTL_MS = 60_000;

export type OpenAICodexUsageStatus = "ok" | "warning" | "exhausted" | "unknown";

export type OpenAICodexUsageSummary = {
	text: string;
	status: OpenAICodexUsageStatus;
};

export type OpenAICodexRequestAuth =
	| {
			ok: true;
			apiKey?: string;
			headers?: Record<string, string>;
	  }
	| {
			ok: false;
			error: string;
	  };

export type OpenAICodexUsageAuthProvider = {
	isUsingOAuth(model: Model<Api>): boolean;
	getApiKeyAndHeaders(model: Model<Api>): Promise<OpenAICodexRequestAuth>;
};

type CodexUsagePayload = {
	rate_limit?: unknown;
};

type ParsedUsageWindow = {
	usedPercent?: number;
	limitWindowSeconds?: number;
};

type ParsedLimit = {
	limitReached?: boolean;
	primary?: ParsedUsageWindow;
	secondary?: ParsedUsageWindow;
};

type JwtPayload = {
	[JWT_AUTH_CLAIM]?: {
		chatgpt_account_id?: string;
	};
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function base64UrlDecode(input: string): string {
	const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
	const padLength = (4 - (base64.length % 4)) % 4;
	const binary = globalThis.atob(base64 + "=".repeat(padLength));
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

function parseJwt(token: string): JwtPayload | null {
	const parts = token.split(".");
	const payload = parts[1];
	if (parts.length !== 3 || !payload) return null;
	try {
		return JSON.parse(base64UrlDecode(payload)) as JwtPayload;
	} catch {
		return null;
	}
}

function extractAccountId(token: string): string | undefined {
	return parseJwt(token)?.[JWT_AUTH_CLAIM]?.chatgpt_account_id;
}

function normalizeCodexBaseUrl(baseUrl: string | undefined): string {
	const trimmed = baseUrl?.trim() ? baseUrl.trim() : DEFAULT_CODEX_BASE_URL;
	const base = trimmed.replace(/\/+$/, "");
	const lower = base.toLowerCase();
	if (
		(lower.startsWith("https://chatgpt.com") || lower.startsWith("https://chat.openai.com")) &&
		!lower.includes("/backend-api")
	) {
		return `${base}/backend-api`;
	}
	return base;
}

function buildCodexUsageUrl(baseUrl: string): string {
	return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}${CODEX_USAGE_PATH}`;
}

function parseUsageWindow(payload: unknown): ParsedUsageWindow | undefined {
	if (!isRecord(payload)) return undefined;
	const usedPercent = toNumber(payload.used_percent);
	const limitWindowSeconds = toNumber(payload.limit_window_seconds);
	if (usedPercent === undefined && limitWindowSeconds === undefined) return undefined;
	return { usedPercent, limitWindowSeconds };
}

function parseLimit(payload: unknown): ParsedLimit | null {
	if (!isRecord(payload)) return null;
	const primary = parseUsageWindow(payload.primary_window);
	const secondary = parseUsageWindow(payload.secondary_window);
	const limitReached = toBoolean(payload.limit_reached);
	if (!primary && !secondary && limitReached === undefined) return null;
	return { primary, secondary, limitReached };
}

function parseUsagePayload(payload: unknown): ParsedLimit | null {
	if (!isRecord(payload)) return null;
	const raw = payload as CodexUsagePayload;
	return parseLimit(raw.rate_limit);
}

function formatWindowId(seconds: number | undefined, fallback: "primary" | "secondary"): string {
	if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return fallback;
	if (Math.abs(seconds - ONE_WEEK_SECONDS) <= ONE_HOUR_SECONDS) return "1W";
	if (seconds >= ONE_WEEK_SECONDS) return `${Math.round(seconds / ONE_WEEK_SECONDS)}W`;
	if (seconds >= ONE_DAY_SECONDS) return `${Math.round(seconds / ONE_DAY_SECONDS)}D`;
	return `${Math.max(1, Math.round(seconds / ONE_HOUR_SECONDS))}H`;
}

function formatUsedPercent(usedPercent: number | undefined): string {
	if (usedPercent === undefined) return "?";
	const clamped = Math.min(Math.max(usedPercent, 0), 100);
	return `${clamped.toFixed(1)}%`;
}

function usageStatus(usedPercent: number | undefined, limitReached: boolean | undefined): OpenAICodexUsageStatus {
	if (limitReached) return "exhausted";
	if (usedPercent === undefined) return "unknown";
	if (usedPercent >= 100) return "exhausted";
	if (usedPercent >= 90) return "warning";
	return "ok";
}

function worstStatus(statuses: OpenAICodexUsageStatus[]): OpenAICodexUsageStatus {
	if (statuses.includes("exhausted")) return "exhausted";
	if (statuses.includes("warning")) return "warning";
	if (statuses.includes("unknown")) return "unknown";
	return "ok";
}

function buildSummary(parsed: ParsedLimit): OpenAICodexUsageSummary | null {
	const parts: string[] = [];
	const statuses: OpenAICodexUsageStatus[] = [];
	const windows: Array<["primary" | "secondary", ParsedUsageWindow | undefined]> = [
		["primary", parsed.primary],
		["secondary", parsed.secondary],
	];

	for (const [key, window] of windows) {
		if (!window) continue;
		parts.push(`${formatWindowId(window.limitWindowSeconds, key)} ${formatUsedPercent(window.usedPercent)}`);
		statuses.push(usageStatus(window.usedPercent, parsed.limitReached));
	}

	if (parts.length === 0) return null;
	return { text: parts.join(" "), status: worstStatus(statuses) };
}

export function getOpenAICodexUsageCacheTtlMs(): number {
	return USAGE_CACHE_TTL_MS;
}

export async function fetchOpenAICodexUsageSummary(
	authProvider: OpenAICodexUsageAuthProvider,
	model: Model<Api>,
	signal?: AbortSignal,
): Promise<OpenAICodexUsageSummary | null> {
	if (model.provider !== "openai-codex" || !authProvider.isUsingOAuth(model)) return null;

	const auth = await authProvider.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) return null;

	const accountId = extractAccountId(auth.apiKey);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${auth.apiKey}`,
		"User-Agent": "Pi-Coding-Agent/1.0",
		...auth.headers,
	};
	if (accountId) {
		headers["ChatGPT-Account-Id"] = accountId;
	}

	const response = await fetch(buildCodexUsageUrl(normalizeCodexBaseUrl(model.baseUrl)), { headers, signal });
	if (!response.ok) return null;

	const payload = (await response.json()) as unknown;
	const parsed = parseUsagePayload(payload);
	return parsed ? buildSummary(parsed) : null;
}
