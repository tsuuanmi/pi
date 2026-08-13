Vendored from codex-chatgpt-web commit bda266b45c0e9d73c7a6e932a7c556954f9cea9c.

Targeted package patches:

- `src/browser-login.ts` ports durable login capture from upstream v2.1.9 commit 7d4e08c and retains
  polling across navigation/page replacement so transient Cloudflare challenge surfaces are waited
  out instead of accepted or failed prematurely.
- Config/browser/server patches add package-owned compact headed-window settings and bounded idle
  shutdown. The daemon's existing singleton browser worker remains authoritative.
- Tunnel CLI/server patches expose direct Linux `connect`/`disconnect` actions and stop Full-mode
  tunnel runtime during daemon cleanup. The existing daemon broker/MCP implementation is unchanged.

No other v2.1.9 changes are included. General upstream synchronization remains out of scope.

Upstream has since advanced to commit 9f74486 ("Clean up dead code and brittle tests"), which
removes the web-search sidecar and unreferenced exports. It was reviewed and deliberately not
synced: the package depends on none of the removed code, and the turn-metadata, login, doctor, and
model-catalog contracts it relies on are unchanged between v2.1.9 and 9f74486.
