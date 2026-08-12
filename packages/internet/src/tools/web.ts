import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import { fetchPage } from "#internet/web/fetch";
import { searchWeb } from "#internet/web/search";

export function registerWebTools(host: Pick<ExtensionAPI, "registerTool">): void {
	host.registerTool({
		name: "internet_search",
		label: "Internet Search",
		description: "Search the public web and return source URLs with snippets.",
		parameters: Type.Object({
			query: Type.String({ minLength: 1 }),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
		}),
		async execute(_id, params) {
			const results = await searchWeb(params.query, params.limit ?? 5);
			return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }], details: { results } };
		},
	});

	host.registerTool({
		name: "internet_fetch",
		label: "Internet Fetch",
		description: "Fetch readable text from a public HTTP or HTTPS URL.",
		parameters: Type.Object({ url: Type.String({ minLength: 1 }) }),
		async execute(_id, params) {
			const page = await fetchPage(params.url);
			return { content: [{ type: "text", text: page.text }], details: page };
		},
	});
}
