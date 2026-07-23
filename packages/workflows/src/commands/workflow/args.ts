import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { getWorkflowManifest, PI_WORKFLOW_SKILLS } from "#workflows/registry/workflow-manifest";
import type { WorkflowSkill } from "#workflows/session/paths";
import { WORKFLOW_SKILL_HELP } from "#workflows/skills/workflow-help-registry";
import type { WorkflowSkillHelp } from "#workflows/skills/workflow-help-types";

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

const TOP_LEVEL_WORKFLOW_VERBS = new Set(Object.keys(WORKFLOW_VERB_DESCRIPTIONS));

const SKILL_HELP: Record<WorkflowSkill, WorkflowSkillHelp> = WORKFLOW_SKILL_HELP;

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
