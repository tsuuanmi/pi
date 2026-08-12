import { registerWebTools } from "#internet/tools/web";
import { captureTools } from "#internet-test/tools/helpers";

vi.mock("#internet/web/search", () => ({
	searchWeb: vi.fn(async () => [{ title: "Result", url: "https://example.com", snippet: "Summary" }]),
}));
vi.mock("#internet/web/fetch", () => ({
	fetchPage: vi.fn(async () => ({ url: "https://example.com/", contentType: "text/plain", text: "Page" })),
}));

describe("web tools", () => {
	it("registers read-only search and fetch tools", async () => {
		const tools = captureTools(registerWebTools);
		const search = await tools
			.get("internet_search")
			?.execute("call", { query: "pi", limit: 3 }, undefined, undefined, {} as never);
		const fetch = await tools
			.get("internet_fetch")
			?.execute("call", { url: "https://example.com" }, undefined, undefined, {} as never);
		expect(search?.details).toMatchObject({ results: [{ title: "Result" }] });
		expect(fetch?.content).toEqual([{ type: "text", text: "Page" }]);
	});
});
