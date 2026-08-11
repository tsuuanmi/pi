# Final Package

Deterministic assembly of workflow report, changelog, and handoff sections.

**Source:** `src/artifacts/final-package.ts`

`assembleFinalPackage()` reads only the canonical `report`, `changelog`, and `handoff` fields. Missing sections are represented as `null`; legacy aliases are not inferred.
