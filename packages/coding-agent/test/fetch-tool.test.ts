import { describe, expect, it } from "vitest";
import { createFetchToolDefinition, type FetchToolDetails } from "../src/workflows/harness-tools/fetch.ts";

const fetchTool = createFetchToolDefinition();

// Mock fetch for testing
function mockFetch(response: {
	ok: boolean;
	status: number;
	url: string;
	text: string;
	contentType: string;
}): typeof fetch {
	return (async () =>
		({
			ok: response.ok,
			status: response.status,
			url: response.url,
			headers: {
				get: (name: string) => (name === "content-type" ? response.contentType : null),
			},
			text: async () => response.text,
		}) as unknown as Response) as typeof fetch;
}

describe("fetch tool", () => {
	it("has correct name and description", () => {
		expect(fetchTool.name).toBe("fetch");
		expect(fetchTool.description).toContain("Fetch a URL");
	});

	it("normalizes URLs without scheme", async () => {
		const originalFetch = globalThis.fetch;
		let calledUrl = "";
		globalThis.fetch = ((url: string) => {
			calledUrl = url;
			return Promise.resolve({
				ok: true,
				status: 200,
				url: url,
				headers: { get: () => "text/plain" },
				text: async () => "hello",
			} as unknown as Response);
		}) as typeof fetch;

		try {
			await fetchTool.execute("tc-1", { url: "example.com" }, undefined, undefined, undefined as never);
			expect(calledUrl).toBe("https://example.com");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("fetches and returns text content", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch({
			ok: true,
			status: 200,
			url: "https://example.com/test",
			text: "Hello, world!",
			contentType: "text/plain",
		});

		try {
			const result = await fetchTool.execute(
				"tc-1",
				{ url: "https://example.com/test" },
				undefined,
				undefined,
				undefined as never,
			);
			const text = (result.content[0] as { text: string }).text;
			expect(text).toContain("Hello, world!");
			expect(text).toContain("Status: 200");
			expect(text).toContain("Content-Type: text/plain");
			expect((result.details as FetchToolDetails).method).toBe("text");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("strips HTML tags", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch({
			ok: true,
			status: 200,
			url: "https://example.com",
			text: "<html><head><title>Test</title></head><body><h1>Hello</h1><p>World &amp; stuff</p></body></html>",
			contentType: "text/html",
		});

		try {
			const result = await fetchTool.execute(
				"tc-1",
				{ url: "https://example.com" },
				undefined,
				undefined,
				undefined as never,
			);
			const text = (result.content[0] as { text: string }).text;
			expect(text).toContain("Hello");
			expect(text).toContain("World & stuff");
			expect(text).not.toContain("<html>");
			expect(text).not.toContain("<h1>");
			expect((result.details as FetchToolDetails).method).toBe("html-stripped");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("pretty-prints JSON", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch({
			ok: true,
			status: 200,
			url: "https://api.example.com",
			text: '{"b":2,"a":1}',
			contentType: "application/json",
		});

		try {
			const result = await fetchTool.execute(
				"tc-1",
				{ url: "https://api.example.com" },
				undefined,
				undefined,
				undefined as never,
			);
			const text = (result.content[0] as { text: string }).text;
			expect(text).toContain('"a": 1');
			expect(text).toContain('"b": 2');
			expect((result.details as FetchToolDetails).method).toBe("json");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("returns raw content when raw=true", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch({
			ok: true,
			status: 200,
			url: "https://example.com",
			text: "<html><body>Raw HTML</body></html>",
			contentType: "text/html",
		});

		try {
			const result = await fetchTool.execute(
				"tc-1",
				{ url: "https://example.com", raw: true },
				undefined,
				undefined,
				undefined as never,
			);
			const text = (result.content[0] as { text: string }).text;
			expect(text).toContain("<html>");
			expect((result.details as FetchToolDetails).method).toBe("raw");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("removes script and style blocks", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch({
			ok: true,
			status: 200,
			url: "https://example.com",
			text: "<style>.x{color:red}</style><script>alert(1)</script><p>content</p>",
			contentType: "text/html",
		});

		try {
			const result = await fetchTool.execute(
				"tc-1",
				{ url: "https://example.com" },
				undefined,
				undefined,
				undefined as never,
			);
			const text = (result.content[0] as { text: string }).text;
			expect(text).toContain("content");
			expect(text).not.toContain("alert");
			expect(text).not.toContain("color:red");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
