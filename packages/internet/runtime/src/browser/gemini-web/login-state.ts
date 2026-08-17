import { lstatSync, readFileSync } from "node:fs";

const MAX_STORAGE_STATE_BYTES = 10 * 1024 * 1024;
const GEMINI_ORIGIN = "https://gemini.google.com";
const allowedCookieDomains = new Set([
	"google.com",
	".google.com",
	"accounts.google.com",
	"gemini.google.com",
]);

type SameSite = "Strict" | "Lax" | "None";

export interface GeminiStorageCookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	expires: number;
	httpOnly: boolean;
	secure: boolean;
	sameSite: SameSite;
	partitionKey?: string;
}

export interface GeminiStorageOrigin {
	origin: string;
	localStorage: Array<{ name: string; value: string }>;
}

export interface GeminiStorageState {
	cookies: GeminiStorageCookie[];
	origins: GeminiStorageOrigin[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function allowedCookieDomain(domain: string): boolean {
	return allowedCookieDomains.has(domain.toLowerCase());
}

function sanitizeCookie(value: unknown): GeminiStorageCookie | undefined {
	if (!isRecord(value) || typeof value.domain !== "string" || !allowedCookieDomain(value.domain)) return undefined;
	if (
		typeof value.name !== "string"
		|| typeof value.value !== "string"
		|| typeof value.path !== "string"
		|| typeof value.expires !== "number"
		|| typeof value.httpOnly !== "boolean"
		|| typeof value.secure !== "boolean"
		|| (value.sameSite !== "Strict" && value.sameSite !== "Lax" && value.sameSite !== "None")
		|| (value.partitionKey !== undefined && typeof value.partitionKey !== "string")
	) {
		throw new Error("Invalid Gemini browser cookie.");
	}
	return {
		name: value.name,
		value: value.value,
		domain: value.domain,
		path: value.path,
		expires: value.expires,
		httpOnly: value.httpOnly,
		secure: value.secure,
		sameSite: value.sameSite,
		...(value.partitionKey === undefined ? {} : { partitionKey: value.partitionKey }),
	};
}

function sanitizeOrigin(value: unknown): GeminiStorageOrigin | undefined {
	if (!isRecord(value) || typeof value.origin !== "string") return undefined;
	let url: URL;
	try {
		url = new URL(value.origin);
	} catch {
		return undefined;
	}
	if (url.protocol !== "https:" || url.origin !== GEMINI_ORIGIN || url.pathname !== "/" || url.search || url.hash) {
		return undefined;
	}
	if (!Array.isArray(value.localStorage)) throw new Error("Invalid Gemini local storage.");
	const localStorage = value.localStorage.map(entry => {
		if (!isRecord(entry) || typeof entry.name !== "string" || typeof entry.value !== "string") {
			throw new Error("Invalid Gemini local storage entry.");
		}
		return { name: entry.name, value: entry.value };
	});
	return { origin: GEMINI_ORIGIN, localStorage };
}

export function sanitizeGeminiStorageState(value: unknown): GeminiStorageState {
	if (!isRecord(value) || !Array.isArray(value.cookies) || !Array.isArray(value.origins)) {
		throw new Error("Gemini browser storage state must contain cookies and origins arrays.");
	}
	const cookies = value.cookies.map(sanitizeCookie).filter(cookie => cookie !== undefined);
	const origins = value.origins.map(sanitizeOrigin).filter(origin => origin !== undefined);
	if (cookies.length === 0) throw new Error("Gemini browser storage state contains no allowed cookies.");
	return { cookies, origins };
}

export function readGeminiStorageState(path: string): GeminiStorageState {
	const file = lstatSync(path);
	if (file.isSymbolicLink() || !file.isFile()) throw new Error("Gemini browser storage state must be a regular file.");
	if (file.size === 0 || file.size > MAX_STORAGE_STATE_BYTES) {
		throw new Error("Gemini browser storage state must be non-empty and no larger than 10 MiB.");
	}
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, "utf8"));
	} catch (cause) {
		throw new Error("Gemini browser storage state is not valid JSON.", { cause });
	}
	return sanitizeGeminiStorageState(value);
}
