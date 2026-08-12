import { lookup } from "node:dns/promises";
import { get as getHttp } from "node:http";
import { get as getHttps } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 5;
const TEXT_CONTENT_TYPES = ["text/", "application/json", "application/xml", "application/xhtml+xml"];

export interface FetchedPage {
	url: string;
	contentType: string;
	text: string;
}

export interface FetchPageOptions {
	fetch?: typeof globalThis.fetch;
	lookup?: typeof lookup;
	maxBytes?: number;
	timeoutMs?: number;
	maxRedirects?: number;
}

function publicIpv4(address: string): boolean {
	const parts = address.split(".").map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
	const [a, b, c] = parts;
	return !(
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 0 && (c === 0 || c === 2)) ||
		(a === 192 && b === 88 && c === 99) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		(a === 198 && b === 51 && c === 100) ||
		(a === 203 && b === 0 && c === 113) ||
		a >= 224
	);
}

function ipv6Bytes(address: string): Uint8Array | undefined {
	const normalized = address.toLowerCase().split("%", 1)[0] ?? "";
	const sections = normalized.split("::");
	if (sections.length > 2) return undefined;
	const parse = (part: string): number[] | undefined => {
		if (!part) return [];
		const words: number[] = [];
		for (const value of part.split(":")) {
			if (value.includes(".")) {
				if (!publicIpv4(value) && isIP(value) !== 4) return undefined;
				const bytes = value.split(".").map(Number);
				words.push((bytes[0]! << 8) | bytes[1]!, (bytes[2]! << 8) | bytes[3]!);
				continue;
			}
			if (!/^[0-9a-f]{1,4}$/.test(value)) return undefined;
			words.push(Number.parseInt(value, 16));
		}
		return words;
	};
	const left = parse(sections[0] ?? "");
	const right = parse(sections[1] ?? "");
	if (!left || !right) return undefined;
	const omitted = sections.length === 2 ? 8 - left.length - right.length : 0;
	if (omitted < 0 || (sections.length === 1 && left.length !== 8)) return undefined;
	const words = [...left, ...Array.from({ length: omitted }, () => 0), ...right];
	if (words.length !== 8) return undefined;
	const bytes = new Uint8Array(16);
	for (const [index, word] of words.entries()) {
		bytes[index * 2] = word >> 8;
		bytes[index * 2 + 1] = word & 0xff;
	}
	return bytes;
}

function publicIpv6(address: string): boolean {
	const bytes = ipv6Bytes(address);
	if (!bytes || (bytes[0]! & 0xe0) !== 0x20) return false;
	if (bytes[0] === 0x20 && bytes[1] === 0x01) {
		if (bytes[2] === 0x0d && bytes[3] === 0xb8) return false;
		if (bytes[2] === 0x00 && bytes[3] === 0x00) return false;
		if (bytes[2] === 0x00 && bytes[3] === 0x02 && bytes[4] === 0x00) return false;
		if (bytes[2] === 0x00 && (bytes[3]! & 0xf0) === 0x10) return false;
		if (bytes[2] === 0x00 && (bytes[3]! & 0xf0) === 0x20) return false;
	}
	return !(bytes[0] === 0x20 && bytes[1] === 0x02);
}

function publicAddressValue(address: string): boolean {
	const family = isIP(address);
	return family === 4 ? publicIpv4(address) : family === 6 && publicIpv6(address);
}

function deadlineSignal(deadline: number): AbortSignal {
	return AbortSignal.timeout(Math.max(1, deadline - Date.now()));
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise((resolve, reject) => {
		const aborted = () => reject(signal.reason);
		signal.addEventListener("abort", aborted, { once: true });
		operation.then(
			(value) => {
				signal.removeEventListener("abort", aborted);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", aborted);
				reject(error);
			},
		);
	});
}

async function publicAddress(
	url: URL,
	resolver: typeof lookup,
	signal: AbortSignal,
): Promise<{ address: string; family: number }> {
	if (url.protocol !== "http:" && url.protocol !== "https:")
		throw new Error("internet_fetch supports only HTTP and HTTPS URLs.");
	if (url.username || url.password) throw new Error("internet_fetch does not allow URL credentials.");
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	const family = isIP(hostname);
	const addresses = family
		? [{ address: hostname, family }]
		: await abortable(resolver(hostname, { all: true }), signal);
	if (addresses.length === 0 || addresses.some(({ address }) => !publicAddressValue(address))) {
		throw new Error("internet_fetch blocks private, local, and reserved network destinations.");
	}
	return addresses[0]!;
}

async function pinnedRequest(url: URL, address: string, family: number, signal: AbortSignal): Promise<Response> {
	const get = url.protocol === "https:" ? getHttps : getHttp;
	const lookup: LookupFunction = (_hostname, _options, callback) => callback(null, address, family);
	return new Promise((resolve, reject) => {
		const request = get(
			url,
			{
				headers: { accept: "text/html, text/plain, application/json, application/xml;q=0.9, */*;q=0.1" },
				lookup,
				signal,
			},
			(response) => {
				const headers = new Headers();
				for (const [name, value] of Object.entries(response.headers)) {
					if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
				}
				const status = response.statusCode ?? 500;
				const body =
					status === 204 || status === 205 || status === 304 ? null : (Readable.toWeb(response) as ReadableStream);
				resolve(new Response(body, { status, headers }));
			},
		);
		request.on("error", reject);
	});
}

async function cancelResponse(response: Response, reason?: unknown): Promise<void> {
	try {
		await response.body?.cancel(reason);
	} catch {
		// The underlying stream may already be closed or aborted.
	}
}

async function readBounded(response: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
	const reader = response.body?.getReader();
	if (!reader) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await abortable(reader.read(), signal);
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) throw new Error("internet_fetch response is too large.");
			chunks.push(value);
		}
	} catch (error) {
		await reader.cancel(error).catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function readableText(html: string): string {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

export async function fetchPage(rawUrl: string, options: FetchPageOptions = {}): Promise<FetchedPage> {
	const resolver = options.lookup ?? lookup;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	let url = new URL(rawUrl);

	for (let redirects = 0; redirects <= (options.maxRedirects ?? DEFAULT_MAX_REDIRECTS); redirects++) {
		const signal = deadlineSignal(deadline);
		const destination = await publicAddress(url, resolver, signal);
		const response = options.fetch
			? await abortable(
					options.fetch(url, {
						headers: { accept: "text/html, text/plain, application/json, application/xml;q=0.9, */*;q=0.1" },
						redirect: "manual",
						signal,
					}),
					signal,
				)
			: await pinnedRequest(url, destination.address, destination.family, signal);
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			await cancelResponse(response);
			if (!location) throw new Error(`internet_fetch redirect from ${url} has no location.`);
			url = new URL(location, url);
			continue;
		}
		if (!response.ok) {
			await cancelResponse(response);
			throw new Error(`internet_fetch failed with HTTP ${response.status}.`);
		}
		const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase();
		if (contentEncoding && contentEncoding !== "identity") {
			await cancelResponse(response);
			throw new Error(`internet_fetch does not support ${contentEncoding} content encoding.`);
		}
		const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
		if (!TEXT_CONTENT_TYPES.some((allowed) => contentType.startsWith(allowed))) {
			await cancelResponse(response);
			throw new Error(`internet_fetch does not support content type ${contentType || "unknown"}.`);
		}
		const contentLength = Number(response.headers.get("content-length"));
		if (Number.isFinite(contentLength) && contentLength > maxBytes) {
			await cancelResponse(response);
			throw new Error("internet_fetch response is too large.");
		}
		const bytes = await readBounded(response, maxBytes, signal);
		const decoded = new TextDecoder().decode(bytes);
		return {
			url: url.href,
			contentType,
			text: contentType.includes("html") ? readableText(decoded) : decoded.trim(),
		};
	}
	throw new Error("internet_fetch exceeded the redirect limit.");
}
