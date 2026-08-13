# web/search

Mirrors `src/web/search.ts`.

Bing RSS-backed public web search.

## `WebSearchResult`

```ts
interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}
```

## `searchWeb`

```ts
searchWeb(query, limit, options: FetchPageOptions = {}): Promise<WebSearchResult[]>
```

Builds a Bing RSS search URL (`https://www.bing.com/search?format=rss&q=<query>`), fetches it with
[`fetchPage`](fetch.md), and parses the RSS `<item>` entries. Each item's `title`, `link`, and
`description` are extracted and decoded (XML entities, CDATA, and tags stripped). Only items with a
non-empty title and an `http(s)://` link are kept, up to `limit`. It throws when no parseable
results are returned.
