import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { WorkflowSkill } from "#workflows/harness/shared/session/paths";
import { workflowActiveStatePath, workflowStatePath } from "#workflows/harness/shared/session/session-layout";
import { readWorkflowActiveState, syncWorkflowActiveState } from "#workflows/harness/shared/state/active-state";
import { assertWorkflowSkill, isWorkflowSkill } from "#workflows/harness/shared/state/state-schema";
import {
	clearWorkflowState,
	readWorkflowState,
	writeWorkflowState,
} from "#workflows/harness/shared/state/workflow-state";

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
	force: boolean;
	session?: string;
}

const ACTIONS = new Set(["read", "write", "clear", "handoff", "active", "doctor"]);

function usage(): string {
	return `Usage:
  pi workflow state <skill> read [--session <id>] [--json]
  pi workflow state <skill> write --input '{...}' [--force] [--session <id>] [--json]
  pi workflow state <skill> clear [--force] [--session <id>] [--json]
  pi workflow state <skill> handoff --to <skill> [--session <id>] [--json]
  pi workflow state active [--session <id>] [--json]
  pi workflow state <skill> doctor [--session <id>] [--json]

Skills: deep-interview, ralplan, team, ultragoal
Session: --session <id> or PI_SESSION_ID env var scopes state to a session.
         If omitted, the command errors out; there is no global fallback.
Force: use --force to clear or overwrite terminal/corrupt state.
`;
}

function parseStateArgs(args: string[]): ParsedStateCommand {
	const parsed: ParsedStateCommand = { action: "read", json: false, help: false, force: false };
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
		if (arg === "--force" || arg === "-f") {
			parsed.force = true;
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
		if (arg === "--session") {
			const value = args[++i];
			if (!value) throw new Error("--session requires a value");
			parsed.session = value;
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

		const envSessionId = process.env.PI_SESSION_ID?.trim();
		const sessionId = parsed.session?.trim() || envSessionId || undefined;

		if (!sessionId) {
			throw new Error("No session ID provided. Set PI_SESSION_ID env var or pass --session <id>.");
		}

		if (parsed.action === "active") {
			const state = (await readWorkflowActiveState(cwd, { sessionId })) ?? null;
			return {
				status: 0,
				stdout: formatOutput(
					"read",
					{
						state,
						state_path: workflowActiveStatePath(cwd, sessionId),
					},
					parsed.json,
				),
				stderr: "",
			};
		}

		const skill = requireSkill(parsed.skill, parsed.action);

		if (parsed.action === "read") {
			const state = (await readWorkflowState(cwd, skill, { sessionId })) ?? null;
			return {
				status: 0,
				stdout: formatOutput(
					"read",
					{ ok: true, skill, state_path: workflowStatePath(cwd, skill, sessionId), state },
					parsed.json,
				),
				stderr: "",
			};
		}
		if (parsed.action === "write") {
			const patch = await resolveInput(parsed.input, cwd);
			const state = await writeWorkflowState(cwd, skill, patch, "pi state write", {
				force: parsed.force,
				sessionId,
			});
			await syncWorkflowActiveState(
				cwd,
				{
					skill,
					active: state.active,
					phase: state.current_phase,
					state_path: workflowStatePath(cwd, skill, sessionId),
				},
				{ sessionId },
			);
			return {
				status: 0,
				stdout: formatOutput(
					"write",
					{ ok: true, skill, state_path: workflowStatePath(cwd, skill, sessionId), state },
					parsed.json,
				),
				stderr: "",
			};
		}
		if (parsed.action === "clear") {
			const state = await clearWorkflowState(cwd, skill, parsed.input ? await resolveInput(parsed.input, cwd) : {}, {
				force: parsed.force,
				sessionId,
			});
			await syncWorkflowActiveState(
				cwd,
				{
					skill,
					active: state.active,
					phase: state.current_phase,
					state_path: workflowStatePath(cwd, skill, sessionId),
				},
				{ sessionId },
			);
			return {
				status: 0,
				stdout: formatOutput(
					"clear",
					{ ok: true, skill, state_path: workflowStatePath(cwd, skill, sessionId), state },
					parsed.json,
				),
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
				{ operation: "handoff-send", sessionId },
			);
			await syncWorkflowActiveState(
				cwd,
				{ skill, active: false, phase: "handoff", state_path: workflowStatePath(cwd, skill, sessionId) },
				{ sessionId },
			);
			const targetState = await writeWorkflowState(
				cwd,
				parsed.to,
				{ active: true, current_phase: "handoff", handoff_from: skill },
				"pi state handoff receive",
				{ operation: "handoff-receive", sessionId },
			);
			await syncWorkflowActiveState(
				cwd,
				{
					skill: parsed.to,
					active: true,
					phase: "handoff",
					state_path: workflowStatePath(cwd, parsed.to, sessionId),
				},
				{ sessionId },
			);
			return {
				status: 0,
				stdout: formatOutput(
					"handoff",
					{
						ok: true,
						skill,
						to: parsed.to,
						state_path: workflowStatePath(cwd, skill, sessionId),
						state,
						target_state_path: workflowStatePath(cwd, parsed.to, sessionId),
						target_state: targetState,
					},
					parsed.json,
				),
				stderr: "",
			};
		}
		if (parsed.action === "doctor") {
			try {
				await readWorkflowState(cwd, skill, { sessionId });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (message.includes("corrupt")) {
					return {
						status: 1,
						stdout: "",
						stderr: `CORRUPT ${workflowStatePath(cwd, skill, sessionId)}: ${message}\nHint: use --force to recover: pi workflow state ${skill} clear --force --session ${sessionId}\n`,
					};
				}
				throw error;
			}
			return {
				status: 0,
				stdout: formatOutput(
					"doctor",
					{ ok: true, skill, state_path: workflowStatePath(cwd, skill, sessionId), session_id: sessionId },
					parsed.json,
				),
				stderr: "",
			};
		}
		throw new Error(`unknown state action: ${parsed.action}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { status: 1, stdout: "", stderr: `Error: ${message}\n` };
	}
}
