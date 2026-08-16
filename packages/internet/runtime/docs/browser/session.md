# `browser/session.ts`

Provider-agnostic Playwright session ownership.

## Responsibilities

- launch one browser and context with provider-supplied executable and storage settings;
- own maintenance and managed pages for one runtime session;
- maintain a single maintenance page and keyed managed conversation pages;
- bound managed pages with least-recently-used eviction;
- expose storage state for provider persistence;
- serialize acquisition and eviction decisions;
- protect leased pages from eviction and discard quarantined pages;
- close launches and browser resources deterministically during worker shutdown.

The module does not know provider URLs, selectors, login formats, model IDs, or response schemas.
The provider supplies readiness validation and session options.

## Lease contract

`acquirePage()` returns a lease that must be released. Capacity eviction considers only unleased
pages in least-recently-used order. Releasing with `discard: true` closes and removes a page whose
state is uncertain after a failed or timed-out action.

`close()` marks the session as closing before it joins serialized operations. A browser that
finishes launching during shutdown is closed instead of being published to callers.
