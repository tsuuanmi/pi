import type { Api, Model } from "#ai/types";

const CODEX_USAGE_PATH = "wham/usage";
const CODEX_RESET_CREDITS_PATH = "wham/rate-limit-reset-credits";
const CODEX_RESET_CREDITS_CONSUME_PATH = "wham/rate-limit-reset-credits/consume";
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
	resetCreditsAvailable?: number;
};

export type OpenAICodexResetCredit = {
	id: string;
	status?: string;
	resetType?: string;
	grantedAt?: string;
	expiresAt?: string;
	title?: string;
};

export type OpenAICodexResetCreditsSummary = {
	availableCount: number;
	credits: OpenAICodexResetCredit[];
};

export type OpenAICodexConsumeResetCreditResult = {
	windowsReset?: unknown;
	code?: unknown;
	redeemedAt?: string;
	credit?: OpenAICodexResetCredit;
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
	rate_limit_reset_credits?: unknown;
};

type CodexResetCreditsPayload = {
	available_count?: unknown;
	credits?: unknown;
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

function buildCodexUrl(baseUrl: string, path: string): string {
	return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}${path}`;
}

function buildCodexUsageUrl(baseUrl: string): string {
	return buildCodexUrl(baseUrl, CODEX_USAGE_PATH);
}

function buildCodexResetCreditsUrl(baseUrl: string): string {
	return buildCodexUrl(baseUrl, CODEX_RESET_CREDITS_PATH);
}

function buildCodexConsumeResetCreditUrl(baseUrl: string): string {
	return buildCodexUrl(baseUrl, CODEX_RESET_CREDITS_CONSUME_PATH);
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

function parseResetCreditsAvailable(payload: unknown): number | undefined {
	if (!isRecord(payload)) return undefined;
	const raw = payload as CodexUsagePayload;
	if (!isRecord(raw.rate_limit_reset_credits)) return undefined;
	return toNumber(raw.rate_limit_reset_credits.available_count);
}

function normalizeResetCredit(payload: unknown): OpenAICodexResetCredit | null {
	if (!isRecord(payload)) return null;
	const id = typeof payload.id === "string" ? payload.id : undefined;
	if (!id) return null;
	return {
		id,
		status: typeof payload.status === "string" ? payload.status : undefined,
		resetType: typeof payload.reset_type === "string" ? payload.reset_type : undefined,
		grantedAt: typeof payload.granted_at === "string" ? payload.granted_at : undefined,
		expiresAt: typeof payload.expires_at === "string" ? payload.expires_at : undefined,
		title: typeof payload.title === "string" ? payload.title : undefined,
	};
}

function parseResetCreditsPayload(payload: unknown): OpenAICodexResetCreditsSummary | null {
	if (!isRecord(payload)) return null;
	const raw = payload as CodexResetCreditsPayload;
	const credits = Array.isArray(raw.credits)
		? raw.credits.map(normalizeResetCredit).filter((credit) => credit !== null)
		: [];
	const availableCount =
		toNumber(raw.available_count) ?? credits.filter((credit) => credit.status === "available").length;
	return { availableCount, credits };
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

function createResetCreditRequestId(): string {
	if (typeof globalThis.crypto?.randomUUID !== "function") {
		throw new Error("crypto.randomUUID is not available");
	}
	return globalThis.crypto.randomUUID();
}

function buildOpenAICodexHeaders(token: string, headers?: Record<string, string>): Record<string, string> {
	const accountId = extractAccountId(token);
	const requestHeaders: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		"User-Agent": "Pi-Coding-Agent/1.0",
		...headers,
	};
	if (accountId) {
		requestHeaders["ChatGPT-Account-Id"] = accountId;
	}
	return requestHeaders;
}

function buildSummary(parsed: ParsedLimit, resetCreditsAvailable?: number): OpenAICodexUsageSummary | null {
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
	return { text: parts.join(" "), status: worstStatus(statuses), resetCreditsAvailable };
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

	const headers = buildOpenAICodexHeaders(auth.apiKey, auth.headers);

	const response = await fetch(buildCodexUsageUrl(normalizeCodexBaseUrl(model.baseUrl)), { headers, signal });
	if (!response.ok) return null;

	const payload = (await response.json()) as unknown;
	const parsed = parseUsagePayload(payload);
	return parsed ? buildSummary(parsed, parseResetCreditsAvailable(payload)) : null;
}

export async function fetchOpenAICodexResetCredits(
	authProvider: OpenAICodexUsageAuthProvider,
	model: Model<Api>,
	signal?: AbortSignal,
): Promise<OpenAICodexResetCreditsSummary | null> {
	if (model.provider !== "openai-codex" || !authProvider.isUsingOAuth(model)) return null;

	const auth = await authProvider.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) return null;

	const response = await fetch(buildCodexResetCreditsUrl(normalizeCodexBaseUrl(model.baseUrl)), {
		headers: buildOpenAICodexHeaders(auth.apiKey, auth.headers),
		signal,
	});
	if (!response.ok) return null;

	return parseResetCreditsPayload((await response.json()) as unknown);
}

export async function consumeOpenAICodexResetCredit(
	authProvider: OpenAICodexUsageAuthProvider,
	model: Model<Api>,
	creditId: string,
	signal?: AbortSignal,
): Promise<OpenAICodexConsumeResetCreditResult | null> {
	if (model.provider !== "openai-codex" || !authProvider.isUsingOAuth(model)) return null;

	const auth = await authProvider.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) return null;

	const response = await fetch(buildCodexConsumeResetCreditUrl(normalizeCodexBaseUrl(model.baseUrl)), {
		body: JSON.stringify({ credit_id: creditId, redeem_request_id: createResetCreditRequestId() }),
		headers: {
			...buildOpenAICodexHeaders(auth.apiKey, auth.headers),
			"Content-Type": "application/json",
		},
		method: "POST",
		signal,
	});
	if (!response.ok) return null;

	const payload = (await response.json()) as unknown;
	if (!isRecord(payload)) return {};
	const credit = normalizeResetCredit(payload.credit);
	return {
		windowsReset: payload.windows_reset,
		code: payload.code,
		redeemedAt:
			isRecord(payload.credit) && typeof payload.credit.redeemed_at === "string"
				? payload.credit.redeemed_at
				: undefined,
		credit: credit ?? undefined,
	};
}
