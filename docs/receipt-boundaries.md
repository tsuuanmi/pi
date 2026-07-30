# Receipt Boundaries

Receipts are audit records. Each package owns receipts for its own layer and must not take ownership of another layer's schema.

## Receipt owners

| Receipt | Owner | Scope | Must not include |
| --- | --- | --- | --- |
| Tool receipt | `@tsuuanmi/pi-agent` | One tool execution inside one agent run | Task routing, workflow state, workflow artifact layout |
| Task receipt | `@tsuuanmi/pi-orchestrator` | One orchestrated task execution, including routing, retry, metrics, and consequential approval | Workflow state, workflow gates, workflow artifact layout |
| Workflow receipt | `@tsuuanmi/pi-workflows` | One workflow action or workflow state transition | Agent tool receipt schema, orchestrator task receipt schema |
| Session receipt | `@tsuuanmi/pi` when needed | CLI/session integration evidence | Agent, task, or workflow internal schemas |

## Dependency rule

Receipt references may point downward, but schemas do not move upward.

```text
workflow receipt
  may reference taskReceiptId or toolReceiptId
  must not copy task/tool receipt schema

task receipt
  may reference tool execution evidence when exposed by agent APIs
  must not copy workflow receipt schema

tool receipt
  must remain unaware of task and workflow layers
```

## Stable reference shape

When one layer needs to refer to a lower-layer receipt, use a small reference object rather than embedding the full receipt.

```ts
interface ReceiptRef {
  package: "@tsuuanmi/pi-agent" | "@tsuuanmi/pi-orchestrator" | "@tsuuanmi/pi-workflows";
  type: "tool" | "task" | "workflow";
  id: string;
}
```

The owning package decides whether such a reference is public API. Other packages must not define alternate copies of another package's receipt schema.

## Layer-specific rules

### `@tsuuanmi/pi-agent`

Owns:

- tool execution receipt shape
- tool output metadata
- structured tool receipt helpers

Does not own:

- task routing decisions
- task retry policy receipts
- workflow gate receipts
- artifact storage receipts

### `@tsuuanmi/pi-orchestrator`

Owns:

- task execution receipt shape
- routing decision metadata
- retry classification metadata
- consequential approval metadata
- task metrics in checkpoints

Does not own:

- tool registry receipt internals
- workflow approval state
- workflow artifact paths
- Pi session state

### `@tsuuanmi/pi-workflows`

Owns:

- workflow action receipts
- workflow gate receipts
- workflow transaction journals
- workflow artifact receipts

Does not own:

- agent tool receipt schema
- orchestrator task receipt schema
- Pi session receipt schema

Workflow receipts may reference lower-layer receipt IDs and summarize user-facing outcomes, but the full lower-layer receipt remains owned by its package.

### `@tsuuanmi/pi`

Owns only app/session integration records when needed. It should render or route package receipts through public package APIs instead of interpreting private schemas.

## Overlap risks

| Risk | Bad pattern | Correct pattern |
| --- | --- | --- |
| Schema copy | Workflow defines its own copy of `TaskExecutionReceipt` | Workflow references task receipt id and stores workflow-specific summary |
| Upward leakage | Agent tool receipt includes workflow gate fields | Workflow gate receipt references tool receipt id |
| Artifact leakage | Orchestrator receipt stores workflow artifact path policy | Workflow receipt maps task output to artifact path |
| Renderer coupling | Pi UI switches on private receipt internals | Pi UI uses exported package render helpers or stable public fields |

## ROI-ranked cleanup tasks

| Rank | Task | ROI | Owner |
| ---: | --- | --- | --- |
| 1 | Audit existing receipt type names and exports across packages | High | all packages |
| 2 | Ensure workflow receipts reference task/tool receipts by id instead of embedding schemas | High | `pi-workflows` |
| 3 | Document package-level receipt exports in each package README/docs | Medium-high | all packages |
| 4 | Add a shared `ReceiptRef` only if multiple packages need a stable public reference | Medium | design follow-up |
| 5 | Add receipt rendering adapters at package boundaries | Medium | `pi`, package owners |
| 6 | Add cryptographic integrity helpers only after receipt ownership is stable | Low-medium | package owners |

## Acceptance criteria for future receipt changes

- The receipt owner package defines the schema.
- Higher layers use references or public helpers, not copied schemas.
- Lower layers do not mention higher-layer concepts.
- Receipt fields are stable, explicit, and audit-oriented.
- No fallback or legacy receipt aliases are added without an explicit migration plan.
