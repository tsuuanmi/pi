# Bundled Workflow Agents

Bundled profiles live under `src/agents/*.md` and are copied to `dist/agents/` during `npm run build`.

## Profiles

| Profile | Source | Role | Thinking | Tools |
|---------|--------|------|----------|-------|
| `architect` | `src/agents/architect.md` | Feasibility, architecture, and integration review. | `high` | `read`, `grep`, `find`, `bash` |
| `critic` | `src/agents/critic.md` | Risks, tests, edge cases, and failure modes. | `high` | `read`, `grep`, `find`, `bash` |
| `expert` | `src/agents/expert.md` | Ralplan escalation after iterate-cap or explorer-gate human blocker. | `high` | `read`, `grep`, `find`, `bash` |
| `explorer` | `src/agents/explorer.md` | Read-only context map before ralplan planning. | `low` | `read`, `bash` |
| `planner` | `src/agents/planner.md` | Turn requirements into executable plans. | `high` | `read`, `grep`, `find`, `bash` |
| `researcher` | `src/agents/researcher.md` | Persistent read-only external research with cited sources. | `high` | none |
| `prover` | `src/agents/prover.md` | Verify team completion and produce `evidence_matrix`. | `low` | `read`, `bash` |
| `reviewer` | `src/agents/reviewer.md` | Review team task completion and produce `review_report`. | `medium` | `read`, `bash` |
| `worker` | `src/agents/worker.md` | Execute an assigned task or goal and report evidence for review. | `medium` | `read`, `bash`, `write`, `edit` |

## Discovery and Overrides

Pi discovers markdown profiles from user `.agent`/`.agents`, enabled package assets, and trusted project `.agent`/`.agents` directories. Project profiles closest to the current directory win over farther ancestors, user profiles, and package profiles. See [workflow.md](../workflow.md#agent-definition-files) for the complete discovery and frontmatter contract.

## End-to-End Workflow Use

Bundled profiles are wired into workflow-owned execution policy:

- Ralplan selects `explorer`, `planner`, `architect`, `critic`, or `expert`, constructs the role instructions and metadata, then delegates execution to generic `subagent_spawn`.
- Ultragoal selects the active goal and `worker` profile, constructs the goal instructions and metadata, then delegates execution to generic `subagent_spawn`.
- `researcher_spawn` accepts an exact registered ChatGPT Web model and starts the protected persistent `researcher` profile; `researcher_resume` and `researcher_steer` revalidate that model before re-entry. Generic subagent spawn/resume/steer paths reject protected researcher sessions.
- The researcher has no local tools. ChatGPT-native browsing is separate from Pi web tools; the parent remains responsible for local validation, implementation, and synthesis.
- `team_execute` routes the next legal team role through the multi-task orchestrator; `team_resume` resumes its checkpoint.
- Reviewer and prover profiles remain responsible for `review_report` and `evidence_matrix` gate artifacts.
- Orchestrator persists generic lifecycle state but does not select these profiles or interpret their outputs.

## See Also

- [Subagent](../subagent/subagent.md)
- [Workflow control plane](../workflow.md)
