# tools/council

Mirrors `src/tools/council.ts`.

`internet_council` accepts a `question`, optional `quick`/`balanced`/`deep` preset, optional unique
2–6 member selectors in `provider/model` form, and an optional chair selector. It forwards the
current abort signal and session model services to `CouncilService`, returns the synthesis as text,
and includes member responses and routing metadata in `details`.
