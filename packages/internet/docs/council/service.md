# council/service

Mirrors `src/council/service.ts`.

`CouncilService` restricts selection to models registered by enabled internet accounts. Callers can
choose `quick` (2), `balanced` (3), or `deep` (4) presets, or 2–6 explicit `provider/model` members
and an optional chair.

Each member runs once without tools and with a 4,096-token output cap. `@tsuuanmi/pi-orchestrator`
runs at most three independent members concurrently, then dispatches one dependency-aware synthesis
task to the chair. The whole run is capped at ten minutes and exactly one start per task; retries are
disabled. Provider credentials and request headers come from the current Pi session's model registry.
