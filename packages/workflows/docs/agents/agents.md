# Bundled Workflow Agents

Bundled profiles live under `src/agents/*.md` and are copied to `dist/agents/` during `npm run build`.

## Profiles

| Profile | Source | Role | Thinking | Tools |
|---------|--------|------|----------|-------|
| `architect` | `src/agents/architect.md` | Feasibility, architecture, and integration review. | `high` | `read`, `grep`, `find`, `bash` |
| `critic` | `src/agents/critic.md` | Risks, tests, edge cases, and failure modes. | `high` | `read`, `grep`, `find`, `bash` |
| `expert` | `src/agents/expert.md` | Ralplan escalation after iterate-cap or explorer-gate human blocker. | package default | package/default tools |
| `explorer` | `src/agents/explorer.md` | Read-only context map before ralplan planning. | `low` | `read`, `bash` |
| `planner` | `src/agents/planner.md` | Turn requirements into executable plans. | `high` | `read`, `grep`, `find`, `bash` |
| `prover` | `src/agents/prover.md` | Verify team completion and produce `evidence_matrix`. | `low` | `read`, `bash` |
| `reviewer` | `src/agents/reviewer.md` | Review team task completion and produce `review_report`. | `medium` | `read`, `bash` |
| `worker` | `src/agents/worker.md` | Execute an assigned task or goal. | `medium` | `read`, `bash`, `write`, `edit` |

## Discovery and Overrides

Pi discovers markdown profiles from user `.agent`/`.agents`, enabled package assets, and trusted project `.agent`/`.agents` directories. Project profiles closest to the current directory win over farther ancestors, user profiles, and package profiles. See [workflow.md](../workflow.md#agent-definition-files) for the complete discovery and frontmatter contract.

## See Also

- [Subagents](../harness/subagents/subagents.md)
- [Workflow control plane](../workflow.md)
