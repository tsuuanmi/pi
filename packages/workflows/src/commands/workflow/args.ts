import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { getWorkflowManifest, PI_WORKFLOW_SKILLS } from "#workflows/registry/workflow-manifest";
import type { WorkflowSkill } from "#workflows/session/paths";

const SKILL_VERBS = new Set<WorkflowSkill>(PI_WORKFLOW_SKILLS);

export interface ParsedWorkflowCommand {
	verb: string;
	subverb?: string;
	input?: string;
	inputFile?: string;
	json: boolean;
	help: boolean;
	prune: boolean;
	dryRun: boolean;
}

const WORKFLOW_VERB_DESCRIPTIONS: Record<string, string> = {
	state: "Read, write, replace, clear, or diagnose skill state.",
	start: "Start a detached workflow owner process.",
	owner: "Run the workflow owner loop in the current process.",
	submit: "Submit a prompt to a workflow session.",
	observe: "Read workflow runtime state for a session.",
	classify: "Classify workflow runtime state.",
	recover: "Recover stale or interrupted workflow runtime state.",
	validate: "Run declared validation checks for a session.",
	finalize: "Finalize a workflow session.",
	operate: "Run the workflow operator loop toward a goal.",
	gc: "Garbage-collect retired workflow runtime records.",
	events: "Read workflow runtime event history.",
	retire: "Retire workflow runtime state for a session.",
};

interface SkillActionHelp {
	summary: string;
	when: string;
	input: string[];
	example: string;
}

interface SkillHelp {
	docs: string[];
	agentFlow: string[];
	actions: Record<string, SkillActionHelp>;
}

const TOP_LEVEL_WORKFLOW_VERBS = new Set(Object.keys(WORKFLOW_VERB_DESCRIPTIONS));

const SKILL_HELP: Record<WorkflowSkill, SkillHelp> = {
	"deep-interview": {
		docs: [
			"packages/workflows/src/skills/deep-interview/SKILL.md",
			"packages/workflows/src/skills/deep-interview/references/commands.md",
			"packages/workflows/src/skills/deep-interview/assets/schema.json",
		],
		agentFlow: [
			"Initialize/read state with `pi workflow state deep-interview ...` before asking questions.",
			"Call `plan-question` before each user-facing question, then ask exactly one question.",
			"After the answer, call `record-answer`, then `record-scoring` with scores, ambiguity, and triggers.",
			"Before final spec: run `closure-check`, then `restate-goal`, then `write-spec`.",
		],
		actions: {
			"plan-question": {
				summary: "Plan the next targeted question and mark the round waiting for an answer.",
				when: "Use immediately before asking each Deep Interview question.",
				input: [
					"sessionId?: string (current session; required in agent/runtime use)",
					"round: number (required)",
					"questionText: string (required; exact one-question prompt)",
					"questionId?: string",
					"component?: string",
					"dimension?: string",
					"ambiguity?: number",
					"rationale?: string",
				],
				example: `pi workflow deep-interview plan-question --input '{"sessionId":"h-...","round":1,"questionText":"..."}' --json`,
			},
			"record-answer": {
				summary: "Record or replace an answered round, including optional topology lock.",
				when: "Use after the user answers and before scoring.",
				input: [
					"sessionId?: string",
					"round?: number",
					"round_id?: string",
					"questionId?: string",
					"questionText?: string",
					"component?: string",
					"dimension?: string",
					"ambiguity?: number",
					"selectedOptions?: string[]",
					"customInput?: string",
					"topology?: object (Round 0 topology lock)",
				],
				example: `pi workflow deep-interview record-answer --input '{"sessionId":"h-...","round":1,"customInput":"..."}' --json`,
			},
			"record-scoring": {
				summary: "Persist scores, ambiguity, triggers, and advisory metadata for a round.",
				when: "Use after `record-answer`; this moves the round to scored state.",
				input: [
					"sessionId?: string",
					"round: number (required)",
					"scores: object (required; dimension scores)",
					"ambiguity: number (required)",
					"round_id?: string",
					"questionId?: string",
					"triggers?: object[]",
					"metadata?: object",
				],
				example: `pi workflow deep-interview record-scoring --input '{"sessionId":"h-...","round":1,"scores":{"goal":0.6,"constraints":0.4,"criteria":0.3},"ambiguity":0.57}' --json`,
			},
			"read-compact": {
				summary: "Read prompt-efficient interview state.",
				when: "Use when resuming or before composing a prompt from large history.",
				input: ["sessionId?: string", "lastN?: number"],
				example: `pi workflow deep-interview read-compact --input '{"sessionId":"h-...","lastN":3}' --json`,
			},
			"closure-check": {
				summary: "Run the closure/acceptance guard before spec writing.",
				when: "Use only when ambiguity is at/below threshold or the user explicitly exits early.",
				input: ["sessionId?: string"],
				example: `pi workflow deep-interview closure-check --input '{"sessionId":"h-..."}' --json`,
			},
			"restate-goal": {
				summary: "Record the one-sentence goal confirmation gate.",
				when: "Use after closure passes and before `write-spec`.",
				input: [
					"sessionId?: string",
					"restatedGoal: string (required)",
					"confirm: Yes|Adjust|Missing (required)",
					"adjustment?: string",
				],
				example: `pi workflow deep-interview restate-goal --input '{"sessionId":"h-...","restatedGoal":"...","confirm":"Yes"}' --json`,
			},
			"write-spec": {
				summary: "Persist the finalized spec and optionally hand off to another workflow.",
				when: "Use only after `closure-check` and `restate-goal` gates pass, unless explicitly allowing early exit.",
				input: [
					"sessionId?: string",
					"spec: string (required; markdown content or readable file path)",
					"slug?: string",
					"handoff?: ralplan|team|ultragoal|stop",
					"allowEarlyExit?: boolean",
				],
				example: `pi workflow deep-interview write-spec --input '{"sessionId":"h-...","slug":"my-spec","spec":"# Spec...","handoff":"ralplan"}' --json`,
			},
		},
	},
	ralplan: {
		docs: [
			"packages/workflows/src/skills/ralplan/SKILL.md",
			"packages/workflows/src/skills/ralplan/references/commands.md",
			"packages/workflows/src/skills/ralplan/assets/schema.json",
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
	},
	team: {
		docs: [
			"packages/workflows/src/skills/team/SKILL.md",
			"packages/workflows/src/skills/team/references/commands.md",
			"packages/workflows/src/skills/team/assets/schema.json",
		],
		agentFlow: [
			"Use only after explicit execution approval and only when parallel workstreams are useful.",
			"Start/resume the run, split work with `create-task`, and record coordination with `send-message`.",
			"Use guarded spawn tools for workers/reviewers/prover; persist review/completion gates before completion.",
			"Close with `complete` only after integration and verification evidence exists.",
		],
		actions: {
			start: {
				summary: "Start a coordinated team run.",
				when: "Use after reading an approved plan/task and initializing state if needed.",
				input: [
					"sessionId?: string",
					"task: string (required)",
					"teamId?: string",
					"workers?: {id?,name?,role?}[]",
				],
				example: `pi workflow team start --input '{"sessionId":"h-...","task":"approved plan..."}' --json`,
			},
			snapshot: {
				summary: "Read the full team snapshot.",
				when: "Use before assigning, reviewing, or completing work.",
				input: ["sessionId?: string", "teamId?: string"],
				example: `pi workflow team snapshot --input '{"sessionId":"h-..."}' --json`,
			},
			"read-compact": {
				summary: "Read prompt-efficient team state.",
				when: "Use when resuming or prompting a worker/reviewer/prover.",
				input: ["sessionId?: string", "teamId?: string"],
				example: `pi workflow team read-compact --input '{"sessionId":"h-..."}' --json`,
			},
			"create-task": {
				summary: "Create a worker task with ownership and dependencies.",
				when: "Use after splitting the approved work into non-overlapping workstreams.",
				input: [
					"sessionId?: string",
					"title: string (required)",
					"description: string (required)",
					"teamId?: string",
					"id?: string",
					"owner?: string",
					"dependsOn?: string[]",
				],
				example: `pi workflow team create-task --input '{"sessionId":"h-...","title":"...","description":"..."}' --json`,
			},
			"transition-task": {
				summary: "Move a task to another status with evidence.",
				when: "Use for start/block/fail/complete task transitions; completion requires evidence.",
				input: [
					"sessionId?: string",
					"taskId: string (required)",
					"status: string (required)",
					"teamId?: string",
					"workerId?: string",
					"evidence?: object",
				],
				example: `pi workflow team transition-task --input '{"sessionId":"h-...","taskId":"task-1","status":"in_progress"}' --json`,
			},
			"send-message": {
				summary: "Append a coordination message.",
				when: "Use for durable cross-workstream decisions and handoffs.",
				input: [
					"sessionId?: string",
					"from: string (required)",
					"to: string (required)",
					"body: string (required)",
					"teamId?: string",
					"idempotencyKey?: string",
				],
				example: `pi workflow team send-message --input '{"sessionId":"h-...","from":"lead","to":"task-1","body":"..."}' --json`,
			},
			"record-review-gate": {
				summary: "Persist a reviewer gate artifact for a task.",
				when: "Use after reviewer subagent completes and before task completion.",
				input: [
					"sessionId?: string",
					"taskId: string (required)",
					"reviewReport: object (required)",
					"teamId?: string",
					"recordedBy?: string",
				],
				example: `pi workflow team record-review-gate --input '{"sessionId":"h-...","taskId":"task-1","reviewReport":{}}' --json`,
			},
			"record-completion-gate": {
				summary: "Persist final completion evidence.",
				when: "Use after all tasks complete and prover evidence is available.",
				input: [
					"sessionId?: string",
					"evidenceMatrix: object (required)",
					"teamId?: string",
					"recordedBy?: string",
				],
				example: `pi workflow team record-completion-gate --input '{"sessionId":"h-...","evidenceMatrix":{}}' --json`,
			},
			complete: {
				summary: "Complete, fail, or cancel a team run.",
				when: "Use after integration/verification or when explicitly closing the run.",
				input: ["sessionId?: string", "teamId?: string", "phase?: complete|failed|cancelled", "summary?: string"],
				example: `pi workflow team complete --input '{"sessionId":"h-...","phase":"complete","summary":"..."}' --json`,
			},
		},
	},
	ultragoal: {
		docs: [
			"packages/workflows/src/skills/ultragoal/SKILL.md",
			"packages/workflows/src/skills/ultragoal/references/commands.md",
			"packages/workflows/src/skills/ultragoal/assets/schema.json",
		],
		agentFlow: [
			"Use only for approved concrete execution; route vague requests to deep-interview or ralplan.",
			"Create/resume the plan, `start-next` before implementation, then edit and verify.",
			"Use `checkpoint` with substantive evidence; complete checkpoints need the full nested qualityGate.",
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
	},
};

function workflowVerbsHelp(): string {
	return Object.entries(WORKFLOW_VERB_DESCRIPTIONS)
		.map(([verb, description]) => `  ${verb.padEnd(10)} ${description}`)
		.join("\n");
}

function skillListHelp(): string {
	return PI_WORKFLOW_SKILLS.map((skill) => {
		const manifest = getWorkflowManifest(skill);
		return `  ${skill.padEnd(14)} ${manifest.graphLabel}`;
	}).join("\n");
}

function skillActionsHelp(skill: WorkflowSkill): string {
	const help = SKILL_HELP[skill];
	return getWorkflowManifest(skill)
		.verbs.map((verb) => {
			const action = help.actions[verb.name];
			return `  ${verb.name.padEnd(24)} ${action?.summary ?? "Run this skill action."}`;
		})
		.join("\n");
}

function skillFlowHelp(skill: WorkflowSkill): string {
	return SKILL_HELP[skill].agentFlow.map((step, index) => `  ${index + 1}. ${step}`).join("\n");
}

function skillActionDetailsHelp(skill: WorkflowSkill): string {
	return getWorkflowManifest(skill)
		.verbs.map((verb) => {
			const action = SKILL_HELP[skill].actions[verb.name];
			if (!action) return `  ${verb.name}\n    Parameters: see implementation.`;
			const input = action.input.map((line) => `    - ${line}`).join("\n");
			return `  ${verb.name}\n    What: ${action.summary}\n    When: ${action.when}\n    Parameters:\n${input}\n    Example: ${action.example}`;
		})
		.join("\n\n");
}

function skillDocsHelp(skill: WorkflowSkill): string {
	return SKILL_HELP[skill].docs.map((doc) => `  - ${doc}`).join("\n");
}

export function usage(): string {
	return `Usage:
  pi workflow <verb> [--input '{...}' | --input-file ./payload.json] [--json]
  pi workflow state <skill> <read|write|clear|handoff|doctor> [options]
  pi workflow <deep-interview|ralplan|team|ultragoal> <action> [--input '{...}' | --input-file ./payload.json] [--json]
  pi workflow <skill> --help

Workflow verbs:
${workflowVerbsHelp()}

Skills:
${skillListHelp()}

Run \`pi workflow <skill> --help\` for agent workflow order, per-action parameters, examples, and docs.

Options:
  --input <json>       JSON object payload for the command
  --input-file <path>  Read JSON object payload from a file
  --json               Pretty-print JSON output where supported
  --prune              Remove records during gc (gc only)
  --dry-run            Preview gc without removing records (gc only)
  --help, -h           Show workflow or skill help

Examples:
  pi workflow observe --input '{"sessionId":"h-..."}' --json
  pi workflow gc --dry-run --json
  pi workflow ralplan status --input '{"sessionId":"h-..."}' --json
  pi workflow deep-interview read-compact --input-file ./payload.json --json

State root: PI_HARNESS_STATE_ROOT or <workspace>/.pi/state/harness
`;
}

export function skillUsage(skill: WorkflowSkill): string {
	const manifest = getWorkflowManifest(skill);
	return `Usage:
  pi workflow ${skill} <action> [--input '{...}' | --input-file ./payload.json] [--json]

${manifest.graphLabel} agent flow:
${skillFlowHelp(skill)}

${manifest.graphLabel} actions:
${skillActionsHelp(skill)}

Action details and parameters:
${skillActionDetailsHelp(skill)}

Input rules:
  - Commands accept a JSON object with --input or --input-file.
  - Pass sessionId from the current interactive/runtime session; do not rely on fallback environment state in agents.
  - Use pi workflow state ${skill} read|write|clear|handoff|doctor for envelope state; use the action commands below for workflow-safe merges.

Docs:
${skillDocsHelp(skill)}
`;
}

export function isWorkflowSkill(value: string): value is WorkflowSkill {
	return SKILL_VERBS.has(value as WorkflowSkill);
}

export function isTopLevelWorkflowVerb(value: string): boolean {
	return TOP_LEVEL_WORKFLOW_VERBS.has(value);
}

export function parseWorkflowArgs(args: string[]): ParsedWorkflowCommand {
	const parsed: ParsedWorkflowCommand = { verb: "observe", json: false, help: false, prune: false, dryRun: false };
	let verbSet = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--help" || arg === "-h") {
			parsed.help = true;
			continue;
		}
		if (arg === "--json") {
			parsed.json = true;
			continue;
		}
		if (arg === "--prune") {
			parsed.prune = true;
			continue;
		}
		if (arg === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (arg === "--input") {
			const value = args[++i];
			if (value === undefined) throw new Error("--input requires a value");
			if (parsed.inputFile !== undefined) throw new Error("--input and --input-file cannot be used together");
			parsed.input = value;
			continue;
		}
		if (arg === "--input-file") {
			const value = args[++i];
			if (value === undefined) throw new Error("--input-file requires a value");
			if (parsed.input !== undefined) throw new Error("--input and --input-file cannot be used together");
			parsed.inputFile = value;
			continue;
		}
		if (arg.startsWith("-")) throw new Error(`unknown workflow option: ${arg}`);
		if (!verbSet) {
			parsed.verb = arg;
			verbSet = true;
			continue;
		}
		if (isWorkflowSkill(parsed.verb) && parsed.subverb === undefined) {
			parsed.subverb = arg;
			continue;
		}
		throw new Error(`unknown workflow argument: ${arg}`);
	}
	return parsed;
}

function parseInput(raw: string | undefined): Record<string, unknown> {
	if (!raw?.trim()) return {};
	const parsed = JSON.parse(raw) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("input must be a JSON object");
	return parsed as Record<string, unknown>;
}

export async function parseWorkflowInput(parsed: ParsedWorkflowCommand, cwd: string): Promise<Record<string, unknown>> {
	if (parsed.inputFile === undefined) return parseInput(parsed.input);
	const filePath = isAbsolute(parsed.inputFile) ? parsed.inputFile : resolve(cwd, parsed.inputFile);
	const raw = await readFile(filePath, "utf8");
	return parseInput(raw);
}
