Vendored from codex-chatgpt-web commit bda266b45c0e9d73c7a6e932a7c556954f9cea9c.

`src/browser-login.ts` ports the durable login capture from upstream v2.1.9 commit 7d4e08c:
normal Chrome sign-in, Keychain-aware persistent-profile capture, and independent stored-state
verification. Its authentication checks retain the snapshot's polling across navigation and page
replacement so transient Cloudflare challenge surfaces are waited out instead of accepted or failed
prematurely.

No other v2.1.9 changes are included. General upstream synchronization remains out of scope.

Upstream has since advanced to commit 9f74486 ("Clean up dead code and brittle tests"), which
removes the web-search sidecar and unreferenced exports. It was reviewed and deliberately not
synced: the package depends on none of the removed code, and the turn-metadata, login, doctor, and
model-catalog contracts it relies on are unchanged between v2.1.9 and 9f74486.
