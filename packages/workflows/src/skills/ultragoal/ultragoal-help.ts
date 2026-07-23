import type { WorkflowSkillHelp } from "#workflows/skills/workflow-help-types";

export const ULTRAGOAL_SKILL_HELP: WorkflowSkillHelp = {
	skill: "ultragoal",
	label: "Ultragoal",
	docs: [
		"packages/workflows/src/skills/ultragoal/SKILL.md",
		"packages/workflows/src/skills/ultragoal/references/commands.md",
		"packages/workflows/src/skills/ultragoal/assets/schema.json",
	],
	commandOrder: [
		"`pi workflow state ultragoal read --session <id> --json` to inspect state.",
		"`pi workflow ultragoal status` or `pi workflow ultragoal read-compact` to inspect goals.",
		"`pi workflow ultragoal create-plan` when no goal plan exists.",
		"`pi workflow ultragoal start-next` before implementation.",
		"`pi workflow ultragoal checkpoint` after progress or completion evidence; this writes a state-only restore checkpoint.",
		"`pi workflow ultragoal restore-checkpoint` only to restore Ultragoal state to the latest valid checkpoint; pass expectedPlanHash from status/read-compact when available; workspace files are not rolled back.",
		"`pi workflow ultragoal record-review-blockers` when review creates durable blockers.",
		"`pi workflow ultragoal classify-blocker` only for policy-classified failed/blocked work.",
		"`pi workflow ultragoal guard` when readiness or quality is uncertain.",
	],
	referenceFooter: [
		"Always pass the current session id as `sessionId` in action payloads. Complete checkpoints require the nested `qualityGate` shape from `../assets/schema.json`. Checkpoint restore is state-only and never rolls back workspace files.",
	],
	agentFlow: [
		"Use only for approved concrete execution; route vague requests to deep-interview or ralplan.",
		"Create/resume the plan, `start-next` before implementation, then edit and verify.",
		"Use `checkpoint` with substantive evidence; complete checkpoints need the full nested qualityGate and create state-only restore points.",
		"Use review-blocker/classify commands only for durable blockers; do not widen scope.",
	],
	actions: {
		"create-plan": {
			summary: "Create an ultragoal execution plan.",
			when: "Use when approved execution has no current goal ledger.",
			input: ["sessionId?: string", "brief: string (required)", "goalMode?: full|focus|single"],
			example: `pi workflow ultragoal create-plan --input '{"sessionId":"h-...","brief":"approved goal..."}' --json`,
		},
		status: {
			summary: "Read full ultragoal status.",
			when: "Use before selecting the next action.",
			input: ["sessionId?: string"],
			example: `pi workflow ultragoal status --input '{"sessionId":"h-..."}' --json`,
		},
		"read-compact": {
			summary: "Read prompt-efficient ultragoal state.",
			when: "Use when resuming or prompting a worker.",
			input: ["sessionId?: string"],
			example: `pi workflow ultragoal read-compact --input '{"sessionId":"h-..."}' --json`,
		},
		"start-next": {
			summary: "Start the next pending goal.",
			when: "Use before implementation work on a goal.",
			input: ["sessionId?: string", "retryFailed?: boolean"],
			example: `pi workflow ultragoal start-next --input '{"sessionId":"h-..."}' --json`,
		},
		checkpoint: {
			summary: "Record progress, completion, failure, or blocked evidence for a goal.",
			when: "Use after meaningful progress or verification; complete status requires full qualityGate.",
			input: [
				"sessionId?: string",
				"goalId: string (required)",
				"status: string (required)",
				"evidence?: string",
				"qualityGate?: object (required for complete)",
			],
			example: `pi workflow ultragoal checkpoint --input '{"sessionId":"h-...","goalId":"goal-1","status":"in_progress","evidence":"..."}' --json`,
		},
		"restore-checkpoint": {
			summary: "Restore Ultragoal state to the latest valid checkpoint.",
			when: "Use after a later task failed and you need to retry from the last successful task state. This does not roll back workspace files.",
			input: ["sessionId?: string", "checkpointId?: string", "expectedPlanHash?: string"],
			example: `pi workflow ultragoal restore-checkpoint --input '{"sessionId":"h-..."}' --json`,
		},
		"record-review-blockers": {
			summary: "Record review blockers as durable follow-up work.",
			when: "Use when review/verification finds resolvable blockers.",
			input: [
				"sessionId?: string",
				"goalId: string (required)",
				"title: string (required)",
				"objective: string (required)",
				"evidence: string (required)",
			],
			example: `pi workflow ultragoal record-review-blockers --input '{"sessionId":"h-...","goalId":"goal-1","title":"...","objective":"...","evidence":"..."}' --json`,
		},
		"classify-blocker": {
			summary: "Classify a blocker before a failed/blocked checkpoint can close work.",
			when: "Use only when the blocker is truly human-blocked or otherwise classified by policy.",
			input: [
				"sessionId?: string",
				"classification: string (required)",
				"evidence: string (required)",
				"goalId?: string",
			],
			example: `pi workflow ultragoal classify-blocker --input '{"sessionId":"h-...","classification":"human_blocked","evidence":"..."}' --json`,
		},
		guard: {
			summary: "Run the ultragoal quality guard.",
			when: "Use before or after checkpoints when quality/readiness is uncertain.",
			input: ["sessionId?: string", "goalId?: string", "currentObjective?: string"],
			example: `pi workflow ultragoal guard --input '{"sessionId":"h-...","goalId":"goal-1"}' --json`,
		},
	},
	typedArgs: [
		{ name: "brief", type: "string" },
		{ name: "goalMode", type: "enum", enumValues: ["aggregate", "per-story"] },
		{ name: "goalId", type: "string" },
		{ name: "checkpointId", type: "string" },
		{ name: "expectedPlanHash", type: "string" },
		{ name: "status", type: "string" },
		{ name: "receiptKind", type: "enum", enumValues: ["per-goal", "final-aggregate"] },
	],
} as const;
