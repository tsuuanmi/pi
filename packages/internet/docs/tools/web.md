# tools/web

Mirrors `src/tools/web.ts`.

Registers two public web tools:

- `internet_search` — searches the public web. Parameters: required `query`, optional `limit`
  (`1..10`). Calls `searchWeb(query, limit ?? 5)` and returns the results JSON as text and as
  `details`.
- `internet_fetch` — fetches readable text from a public HTTP/HTTPS URL. Parameter: required `url`.
  Calls `fetchPage(url)` and returns the page text as text and the full page as `details`.

These tools are the package-owned surface for public web access; see
[`web/fetch.md`](../web/fetch.md) and [`web/search.md`](../web/search.md) for the underlying
transport and its safety checks.
