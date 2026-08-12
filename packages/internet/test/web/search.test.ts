import { searchWeb } from "#internet/web/search";

const publicLookup = vi.fn(async () => [{ address: "204.79.197.200", family: 4 }]);

describe("searchWeb", () => {
	it("parses bounded RSS results", async () => {
		const xml = `<rss><channel>
			<item><title>First</title><link>https://example.com/one</link><description>One &amp; only</description></item>
			<item><title>Second</title><link>https://example.com/two</link><description>Two</description></item>
		</channel></rss>`;
		const fetch = vi.fn(
			async (_input: string | URL | Request) =>
				new Response(xml, { headers: { "content-type": "application/xml" } }),
		);
		await expect(
			searchWeb("query", 1, { fetch: fetch as typeof globalThis.fetch, lookup: publicLookup as never }),
		).resolves.toEqual([{ title: "First", url: "https://example.com/one", snippet: "One & only" }]);
		expect(String(fetch.mock.calls[0]?.[0])).toContain("q=query");
	});
});
