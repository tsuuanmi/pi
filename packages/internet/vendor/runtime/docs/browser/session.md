# `browser/session.ts`

Provider-agnostic Playwright session ownership.

## Responsibilities

- launch browser instances with provider-supplied executable and storage settings;
- own contexts and pages for one runtime session;
- bound managed pages with least-recently-used eviction;
- expose storage state for provider persistence;
- close all browser resources deterministically.

The module does not know provider URLs, selectors, login formats, model IDs, or response schemas.
The provider supplies readiness validation and session options.
