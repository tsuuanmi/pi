/**
 * Fetch tool — HTTP client for fetching URLs and returning content.
 *
 * Supports text, JSON, and HTML content types. HTML is stripped to plain text
 * with basic tag removal (no external dependencies). Large results are
 * truncated with a marker.
 *
 * Simpler than gajae-code's fetch tool (which uses markit, trafilatura, lynx,
 * jina, parallel extract, etc.) but covers the core use case: fetch a URL and
 * return readable text content.
 */
import type { AgentToolResult } from "@tsuuanmi/pi-agent-core";
import type { ToolDefinition } from "@tsuuanmi/pi-agent-core";
import { type Static, Type } from "typebox";

export interface FetchToolDetails {
	url: string;
	finalUrl: string;
	contentType: string;
	status: number;
	truncated: boolean;
	method: string;
}

const MAX_FETCH_BYTES = 100_000;
const MAX_FETCH_LINES = 500;

const fetchSchema = Type.Object({
	url: Type.String({ description: "URL to fetch. Will prepend https:// if no scheme is provided." }),
	raw: Type.Optional(
		Type.Boolean({
			description: "If true, return raw content without HTML tag stripping. Default: false.",
		}),
	),
	timeout: Type.Optional(Type.Number({ description: "Request timeout in seconds. Default: 30." })),
});

function normalizeUrl(url: string): string {
	if (!/^https?:\/\//i.test(url)) {
		return `https://${url}`;
	}
	return url;
}

function stripHtml(html: string): string {
	return (
		html
			// Remove script and style blocks entirely
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
			.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
			.replace(/<!--[\s\S]*?-->/g, "")
			// Convert common block tags to newlines
			.replace(/<\/(p|div|br|h[1-6]|li|tr|hr|blockquote)>/gi, "\n")
			.replace(/<br\s*\/?>/gi, "\n")
			// Remove all remaining tags
			.replace(/<[^>]+>/g, "")
			// Decode common HTML entities
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, " ")
			// Collapse whitespace
			.replace(/[ \t]+/g, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

function formatJson(content: string): string {
	try {
		return JSON.stringify(JSON.parse(content), null, 2);
	} catch {
		return content;
	}
}

function truncateContent(content: string): { text: string; truncated: boolean } {
	const lines = content.split("\n");
	if (lines.length > MAX_FETCH_LINES) {
		return { text: lines.slice(0, MAX_FETCH_LINES).join("\n"), truncated: true };
	}
	if (content.length > MAX_FETCH_BYTES) {
		return { text: content.slice(0, MAX_FETCH_BYTES), truncated: true };
	}
	return { text: content, truncated: false };
}

export function createFetchToolDefinition(): ToolDefinition<typeof fetchSchema, FetchToolDetails> {
	return {
		name: "fetch",
		label: "Fetch URL",
		description:
			"Fetch a URL and return its content as text. Handles HTML (stripped to plain text), JSON (pretty-printed), and other text content types. " +
			"Use `raw: true` to get unprocessed content. Results are truncated to 100KB / 500 lines.",
		promptSnippet: "Fetch a URL and return text content",
		promptGuidelines: ["Use fetch to retrieve web pages, API responses, or other HTTP resources."],
		parameters: fetchSchema,
		execute: async (_toolCallId, params, signal): Promise<AgentToolResult<FetchToolDetails>> => {
			const p = params as Static<typeof fetchSchema>;
			const url = normalizeUrl(p.url.trim());
			const raw = p.raw ?? false;
			const timeoutSec = p.timeout ?? 30;

			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
			const abort = () => controller.abort();
			signal?.addEventListener("abort", abort, { once: true });
			try {
				const response = await fetch(url, {
					signal: controller.signal,
					redirect: "follow",
					headers: { Accept: "text/html, text/plain, text/markdown, application/json, */*" },
				});
				const contentType = response.headers.get("content-type") ?? "unknown";
				const mime = contentType.split(";")[0].trim().toLowerCase();
				const text = await response.text();
				const finalUrl = response.url || url;

				let processed: string;
				let method: string;

				if (raw) {
					processed = text;
					method = "raw";
				} else if (mime.includes("json")) {
					processed = formatJson(text);
					method = "json";
				} else if (mime.includes("html") || mime.includes("xhtml")) {
					processed = stripHtml(text);
					method = "html-stripped";
				} else {
					processed = text;
					method = "text";
				}

				const { text: output, truncated } = truncateContent(processed);

				const header = [
					`URL: ${finalUrl}`,
					`Status: ${response.status}`,
					`Content-Type: ${contentType}`,
					`Method: ${method}`,
					"",
					"---",
					"",
				].join("\n");

				const fullOutput = truncated ? `${header}${output}\n\n[truncated]` : `${header}${output}`;

				return {
					content: [{ type: "text", text: fullOutput }],
					details: {
						url,
						finalUrl,
						contentType,
						status: response.status,
						truncated,
						method,
					},
				};
			} finally {
				clearTimeout(timer);
				signal?.removeEventListener("abort", abort);
			}
		},
	};
}
