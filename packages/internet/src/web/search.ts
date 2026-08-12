import { type FetchPageOptions, fetchPage } from "#internet/web/fetch";

export interface WebSearchResult {
	title: string;
	url: string;
	snippet: string;
}

function xmlText(value: string): string {
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

function element(item: string, name: string): string {
	return xmlText(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i").exec(item)?.[1] ?? "");
}

export async function searchWeb(
	query: string,
	limit: number,
	options: FetchPageOptions = {},
): Promise<WebSearchResult[]> {
	const endpoint = new URL("https://www.bing.com/search");
	endpoint.searchParams.set("format", "rss");
	endpoint.searchParams.set("q", query);
	const page = await fetchPage(endpoint.href, options);
	const results = [...page.text.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
		.map((match) => {
			const item = match[1] ?? "";
			return { title: element(item, "title"), url: element(item, "link"), snippet: element(item, "description") };
		})
		.filter((result) => result.title && /^https?:\/\//.test(result.url))
		.slice(0, limit);
	if (results.length === 0) throw new Error("internet_search returned no parseable results.");
	return results;
}
