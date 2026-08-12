import { fetchPage } from "#internet/web/fetch";

const publicLookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);

function cancellableResponse(
	status: number,
	headers: HeadersInit = {},
): { cancelled: ReturnType<typeof vi.fn>; response: Response } {
	const cancelled = vi.fn();
	const body = new ReadableStream({ cancel: cancelled, start() {} });
	return { cancelled, response: new Response(body, { status, headers }) };
}

describe("fetchPage", () => {
	it("returns readable HTML text", async () => {
		const fetch = vi.fn(
			async () =>
				new Response("<html><script>bad()</script><body>Hello &amp; world</body></html>", {
					headers: { "content-type": "text/html; charset=utf-8" },
				}),
		);
		await expect(
			fetchPage("https://example.com", { fetch: fetch as typeof globalThis.fetch, lookup: publicLookup as never }),
		).resolves.toMatchObject({ url: "https://example.com/", text: "Hello & world" });
	});

	it.each([
		"127.0.0.1",
		"10.0.0.1",
		"169.254.1.1",
		"::1",
		"::ffff:127.0.0.1",
		"::ffff:7f00:1",
		"::7f00:1",
		"fc00::1",
		"fe80::1",
		"ff02::1",
		"2001:db8::1",
		"2002:7f00:1::",
	])("blocks non-public address %s", async (address) => {
		const lookup = vi.fn(async () => [{ address, family: address.includes(":") ? 6 : 4 }]);
		await expect(
			fetchPage("https://example.com", { fetch: vi.fn() as never, lookup: lookup as never }),
		).rejects.toThrow("blocks private");
	});

	it("blocks and cancels a private redirect", async () => {
		const lookup = vi.fn(async (hostname: string) => [
			{ address: hostname === "example.com" ? "93.184.216.34" : "127.0.0.1", family: 4 },
		]);
		const redirect = cancellableResponse(302, { location: "http://localhost/secret" });
		const fetch = vi.fn(async () => redirect.response);
		await expect(
			fetchPage("https://example.com", { fetch: fetch as typeof globalThis.fetch, lookup: lookup as never }),
		).rejects.toThrow("blocks private");
		expect(redirect.cancelled).toHaveBeenCalledOnce();
	});

	it("rejects and cancels encoded and binary responses", async () => {
		const encoded = cancellableResponse(200, { "content-type": "text/plain", "content-encoding": "gzip" });
		await expect(
			fetchPage("https://example.com", {
				fetch: vi.fn(async () => encoded.response) as typeof globalThis.fetch,
				lookup: publicLookup as never,
			}),
		).rejects.toThrow("content encoding");
		expect(encoded.cancelled).toHaveBeenCalledOnce();

		const binary = cancellableResponse(200, { "content-type": "image/png" });
		await expect(
			fetchPage("https://example.com", {
				fetch: vi.fn(async () => binary.response) as typeof globalThis.fetch,
				lookup: publicLookup as never,
			}),
		).rejects.toThrow("content type");
		expect(binary.cancelled).toHaveBeenCalledOnce();
	});

	it("cancels oversized streamed responses", async () => {
		const cancelled = vi.fn();
		const response = new Response(
			new ReadableStream({
				cancel: cancelled,
				start(controller) {
					controller.enqueue(new TextEncoder().encode("12345"));
				},
			}),
			{ headers: { "content-type": "text/plain" } },
		);
		await expect(
			fetchPage("https://example.com", {
				fetch: vi.fn(async () => response) as typeof globalThis.fetch,
				lookup: publicLookup as never,
				maxBytes: 4,
			}),
		).rejects.toThrow("too large");
		expect(cancelled).toHaveBeenCalledOnce();
	});

	it("applies an absolute deadline to a slow response body", async () => {
		const cancelled = vi.fn();
		const response = new Response(new ReadableStream({ cancel: cancelled, start() {} }), {
			headers: { "content-type": "text/plain" },
		});
		await expect(
			fetchPage("https://example.com", {
				fetch: vi.fn(async () => response) as typeof globalThis.fetch,
				lookup: publicLookup as never,
				timeoutMs: 10,
			}),
		).rejects.toMatchObject({ name: "TimeoutError" });
		expect(cancelled).toHaveBeenCalledOnce();
	});
});
