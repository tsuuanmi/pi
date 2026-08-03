import type { WorkflowSkillHelp } from "#workflows/skills/workflow-help-types";

export const RALPLAN_SKILL_HELP: WorkflowSkillHelp = {
	skill: "ralplan",
	label: "Ralplan",
	docs: [
		"packages/workflows/src/skills/ralplan/SKILL.md",
		"packages/workflows/src/skills/ralplan/references/commands.md",
		"packages/workflows/src/skills/ralplan/assets/schema.json",
	],
	commandOrder: [
		"`pi workflow state ralplan read --session <id> --json` to inspect state.",
		"`pi workflow ralplan status` to inspect the active run.",
		"`pi workflow ralplan doctor` when resuming or when status looks inconsistent.",
		"`pi workflow ralplan record-explorer-gate` after the explorer pre-planner gate.",
		"`pi workflow ralplan write-artifact` for planner, architect, critic, revision, expert-stage, and final artifacts.",
		"Stop for explicit user approval when a pending-approval plan exists.",
		"`pi workflow ralplan approve-plan` only after explicit approval/rejection.",
	],
	referenceFooter: [
		"Always pass the current session id as `sessionId` in action payloads. Role agents must persist artifacts through workflow commands and return receipt-only summaries.",
	],
	agentFlow: [
		"Read/initialize ralplan state, then `status`; run `doctor` if resuming or inconsistent.",
		"Run Explorer/Planner/Architect/Critic via `ralplan_run_agent`; role agents persist artifacts with workflow commands.",
		"Use `write-artifact` for planner/architect/critic/revision/expert/final artifacts.",
		"Stop at pending approval; only call `approve-plan` after explicit user approval/rejection.",
	],
	actions: {
		"record-explorer-gate": {
			summary: "Persist the explorer context-map gate artifact.",
			when: "Use before the planner pass when the explorer gate is required or retrying.",
			input: ["sessionId?: string", "contextMap: object (required)", "runId?: string", "recordedBy?: string"],
			example: `pi workflow ralplan record-explorer-gate --input '{"sessionId":"h-...","contextMap":{}}' --json`,
		},
		"write-artifact": {
			summary: "Persist a ralplan stage artifact.",
			when: "Use from role agents for planner, architect, critic, revision, expert-stage, and final plan outputs.",
			input: [
				"sessionId?: string",
				"stage: planner|architect|critic|revision|expert-stage|final (required)",
				"stageN: number (required)",
				"artifact: string (required; markdown content or readable file path)",
				"runId?: string",
				"plannerSubagentId?: string",
				"plannerResumable?: boolean",
			],
			example: `pi workflow ralplan write-artifact --input '{"sessionId":"h-...","stage":"planner","stageN":1,"artifact":"# Plan..."}' --json`,
		},
		status: {
			summary: "Read full ralplan run status.",
			when: "Use before deciding the next planning role or before approval.",
			input: ["sessionId?: string", "runId?: string"],
			example: `pi workflow ralplan status --input '{"sessionId":"h-..."}' --json`,
		},
		"read-compact": {
			summary: "Read prompt-efficient ralplan status.",
			when: "Use when resuming or before passing context to another agent.",
			input: ["sessionId?: string", "runId?: string"],
			example: `pi workflow ralplan read-compact --input '{"sessionId":"h-..."}' --json`,
		},
		doctor: {
			summary: "Diagnose stale, stuck, or inconsistent ralplan state.",
			when: "Use on resume, after failures, or before writing a replacement artifact.",
			input: ["sessionId?: string", "runId?: string"],
			example: `pi workflow ralplan doctor --input '{"sessionId":"h-..."}' --json`,
		},
		"approve-plan": {
			summary: "Record approval/rejection and optionally hand off execution.",
			when: "Use only after the user explicitly approves or rejects the pending plan.",
			input: [
				"sessionId?: string",
				"approved?: boolean (default true)",
				"target?: ultragoal|team|stop",
				"runId?: string",
				"note?: string",
				"overrideCriticVerdict?: boolean",
			],
			example: `pi workflow ralplan approve-plan --input '{"sessionId":"h-...","approved":true,"target":"ultragoal"}' --json`,
		},
	},
	typedArgs: [
		{
			name: "stage",
			type: "enum",
			enumValues: ["planner", "architect", "critic", "revision", "expert-stage", "adr", "final"],
		},
		{ name: "stageN", type: "number" },
		{ name: "runId", type: "string" },
		{ name: "approved", type: "boolean" },
		{ name: "target", type: "enum", enumValues: ["ultragoal", "team", "stop"] },
	],
} as const;
