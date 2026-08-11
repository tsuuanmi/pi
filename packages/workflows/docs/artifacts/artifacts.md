# Stage Artifacts

Durable stage-artifact writing for workflow-owned files.

**Source:** `src/artifacts/artifacts.ts`

`writeStageArtifact()` delegates to the shared atomic text writer, preserving path confinement and durability without owning workflow-specific artifact schemas.

Final-package assembly lives in [final-package.md](final-package.md). Model-visible tool result details live in [../tool/details.md](../tool/details.md). Neither is a durable receipt.
