import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { readWorkflowActiveState, syncWorkflowActiveState } from "../workflows/active-state.ts";
import { type WorkflowSkill, workflowStatePath } from "../workflows/paths.ts";
import { assertWorkflowSkill, isWorkflowSkill } from "../workflows/state-schema.ts";
import { clearWorkflowState, readWorkflowState, writeWorkflowState } from "../workflows/workflow-state.ts";

interface StateCommandResult {
	status: number;
	stdout: string;
	stderr: string;
}

interface ParsedStateCommand {
	action: string;
	skill?: WorkflowSkill;
	input?: string;
	to?: WorkflowSkill;
	json: boolean;
	help: boolean;
}

const ACTIONS = new Set(["read", "write", "clear", "handoff", "active", "doctor"]);

function usage(): string {
	return `Usage:
  pi workflow state <skill> read --json
  pi workflow state <skill> write --input '{"current_phase":"planner","active":true}' --json
  pi workflow state read --skill <skill> --json
  pi workflow state write --skill <skill> --input '{"state":{"active":true}}' --json
  pi workflow state <skill> clear --json
  pi workflow state <skill> handoff --to <skill> --json

Skills: deep-interview, ralplan, team, ultragoal
`;
}

function parseStateArgs(args: string[]): ParsedStateCommand {
	const parsed: ParsedStateCommand = { action: "read", json: false, help: false };
	let actionSet = false;

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
		if (arg === "--skill" || arg === "--mode") {
			const value = args[++i];
			if (!value) throw new Error(`${arg} requires a value`);
			assertWorkflowSkill(value);
			parsed.skill = value;
			continue;
		}
		if (arg === "--input") {
			const value = args[++i];
			if (value === undefined) throw new Error("--input requires a value");
			parsed.input = value;
			continue;
		}
		if (arg === "--input-file") {
			const value = args[++i];
			if (!value) throw new Error("--input-file requires a value");
			parsed.input = `@${value}`;
			continue;
		}
		if (arg === "--to") {
			const value = args[++i];
			if (!value) throw new Error("--to requires a value");
			assertWorkflowSkill(value);
			parsed.to = value;
			continue;
		}
		if (arg.startsWith("-")) throw new Error(`unknown state option: ${arg}`);
		if (isWorkflowSkill(arg) && !parsed.skill) {
			parsed.skill = arg;
			continue;
		}
		if (ACTIONS.has(arg) && !actionSet) {
			parsed.action = arg;
			actionSet = true;
			continue;
		}
		throw new Error(`unknown state argument: ${arg}`);
	}

	return parsed;
}

async function resolveInput(raw: string | undefined, cwd: string): Promise<Record<string, unknown>> {
	if (!raw) return {};
	const text = raw.startsWith("@")
		? await readFile(isAbsolute(raw.slice(1)) ? raw.slice(1) : resolve(cwd, raw.slice(1)), "utf8")
		: raw;
	const parsed = JSON.parse(text) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("state input must be a JSON object");
	}
	const record = parsed as Record<string, unknown>;
	const state = record.state;
	if (state && typeof state === "object" && !Array.isArray(state)) {
		return normalizePatch(state as Record<string, unknown>);
	}
	return normalizePatch(record);
}

function normalizePatch(input: Record<string, unknown>): Record<string, unknown> {
	const patch = { ...input };
	if (typeof patch.phase === "string" && typeof patch.current_phase !== "string") {
		patch.current_phase = patch.phase;
	}
	return patch;
}

function textOutput(action: string, payload: Record<string, unknown>): string {
	if (action === "read") return `${JSON.stringify(payload.state ?? null, null, 2)}\n`;
	if (action === "doctor") return `OK ${payload.state_path}\n`;
	return `${action} ${payload.skill ?? "state"}: ${payload.state_path ?? ""}\n`;
}

function formatOutput(action: string, payload: Record<string, unknown>, json: boolean): string {
	return json ? `${JSON.stringify(payload, null, 2)}\n` : textOutput(action, payload);
}

function requireSkill(skill: WorkflowSkill | undefined, action: string): WorkflowSkill {
	if (!skill) throw new Error(`state ${action} requires --skill <skill> or positional <skill>`);
	return skill;
}

export async function runStateCommand(args: string[], cwd = process.cwd()): Promise<StateCommandResult> {
	try {
		const parsed = parseStateArgs(args);
		if (parsed.help) return { status: 0, stdout: usage(), stderr: "" };
		if (parsed.action === "active") {
			const state = (await readWorkflowActiveState(cwd)) ?? null;
			return {
				status: 0,
				stdout: formatOutput(
					"read",
					{ state, state_path: resolve(cwd, ".pi", "workflows", "active-state.json") },
					parsed.json,
				),
				stderr: "",
			};
		}

		const skill = requireSkill(parsed.skill, parsed.action);
		const statePath = workflowStatePath(cwd, skill);
		if (parsed.action === "read") {
			const state = (await readWorkflowState(cwd, skill)) ?? null;
			return {
				status: 0,
				stdout: formatOutput("read", { ok: true, skill, state_path: statePath, state }, parsed.json),
				stderr: "",
			};
		}
		if (parsed.action === "write") {
			const patch = await resolveInput(parsed.input, cwd);
			const state = await writeWorkflowState(cwd, skill, patch, "pi state write");
			await syncWorkflowActiveState(cwd, {
				skill,
				active: state.active === true,
				phase: typeof state.current_phase === "string" ? state.current_phase : undefined,
				state_path: statePath,
			});
			return {
				status: 0,
				stdout: formatOutput("write", { ok: true, skill, state_path: statePath, state }, parsed.json),
				stderr: "",
			};
		}
		if (parsed.action === "clear") {
			const state = await clearWorkflowState(cwd, skill);
			await syncWorkflowActiveState(cwd, {
				skill,
				active: false,
				phase: state.current_phase,
				state_path: statePath,
			});
			return {
				status: 0,
				stdout: formatOutput("clear", { ok: true, skill, state_path: statePath, state }, parsed.json),
				stderr: "",
			};
		}
		if (parsed.action === "handoff") {
			if (!parsed.to) throw new Error("state handoff requires --to <skill>");
			const state = await writeWorkflowState(
				cwd,
				skill,
				{ active: false, current_phase: "handoff", handoff_to: parsed.to },
				"pi state handoff",
			);
			await syncWorkflowActiveState(cwd, { skill, active: false, phase: "handoff", state_path: statePath });
			const targetPath = workflowStatePath(cwd, parsed.to);
			const targetState = await writeWorkflowState(
				cwd,
				parsed.to,
				{ active: true, current_phase: "handoff", handoff_from: skill },
				"pi state handoff receive",
			);
			await syncWorkflowActiveState(cwd, {
				skill: parsed.to,
				active: true,
				phase: "handoff",
				state_path: targetPath,
			});
			return {
				status: 0,
				stdout: formatOutput(
					"handoff",
					{
						ok: true,
						skill,
						to: parsed.to,
						state_path: statePath,
						state,
						target_state_path: targetPath,
						target_state: targetState,
					},
					parsed.json,
				),
				stderr: "",
			};
		}
		if (parsed.action === "doctor") {
			await readWorkflowState(cwd, skill);
			return {
				status: 0,
				stdout: formatOutput("doctor", { ok: true, skill, state_path: statePath }, parsed.json),
				stderr: "",
			};
		}
		throw new Error(`unknown state action: ${parsed.action}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { status: 1, stdout: "", stderr: `Error: ${message}\n` };
	}
}
