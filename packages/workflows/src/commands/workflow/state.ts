import type { WorkflowCommandResult } from "#workflows/commands/workflow/index";
import { clearWorkflowPhase, PI_WORKFLOW_SKILLS } from "#workflows/registry/workflow-manifest";
import type { WorkflowSkill } from "#workflows/registry/workflow-manifest-types";
import { readWorkflowActiveState } from "#workflows/state/active-state";
import { assertWorkflowSkill } from "#workflows/state/state-schema";
import { clearWorkflowState, readWorkflowState } from "#workflows/state/workflow-state";

const ACTIONS = new Set(["read", "clear", "active", "doctor"]);

interface StateArgs {
	skill?: WorkflowSkill;
	action: "read" | "clear" | "active" | "doctor";
	sessionId: string;
	json: boolean;
}

function usage(): string {
	return [
		"Usage:",
		"  pi workflow state <skill> read --session <id> [--json]",
		"  pi workflow state <skill> clear --session <id> [--json]",
		"  pi workflow state <skill> doctor --session <id> [--json]",
		"  pi workflow state active --session <id> [--json]",
		"",
		`Skills: ${PI_WORKFLOW_SKILLS.join(", ")}`,
	].join("\n");
}

function parseArgs(args: string[]): StateArgs {
	if (args.length === 0) throw new Error(usage());
	const positional: string[] = [];
	let sessionId: string | undefined;
	let json = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json") {
			json = true;
			continue;
		}
		if (arg === "--session") {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) throw new Error("--session requires a value");
			sessionId = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--")) throw new Error(`unknown state option: ${arg}`);
		positional.push(arg);
	}
	if (!sessionId) throw new Error("--session is required");
	if (positional[0] === "active") {
		if (positional.length !== 1) throw new Error(usage());
		return { action: "active", sessionId, json };
	}
	if (positional.length !== 2) throw new Error(usage());
	const [skillName, actionName] = positional;
	assertWorkflowSkill(skillName);
	if (!ACTIONS.has(actionName) || actionName === "active") throw new Error(`unknown state action: ${actionName}`);
	return { skill: skillName, action: actionName as StateArgs["action"], sessionId, json };
}

function print(value: unknown, json: boolean): string {
	return json ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value)}\n`;
}

export async function runStateCommand(args: string[], cwd: string): Promise<WorkflowCommandResult> {
	try {
		const parsed = parseArgs(args);
		if (parsed.action === "active") {
			const state = await readWorkflowActiveState(cwd, { sessionId: parsed.sessionId });
			return { status: 0, stdout: print({ ok: true, state }, parsed.json), stderr: "" };
		}
		const skill = parsed.skill;
		if (!skill) throw new Error("state skill is required");
		if (parsed.action === "read") {
			const state = await readWorkflowState(cwd, skill, { sessionId: parsed.sessionId });
			return { status: 0, stdout: print({ ok: true, skill, state }, parsed.json), stderr: "" };
		}
		if (parsed.action === "doctor") {
			const state = await readWorkflowState(cwd, skill, { sessionId: parsed.sessionId });
			const active = await readWorkflowActiveState(cwd, { sessionId: parsed.sessionId });
			const activeEntry = active?.active_workflows.find((entry) => entry.skill === skill);
			const issues: string[] = [];
			if (state?.active === true && !activeEntry) issues.push("active-state-entry-missing");
			if (state?.active !== true && activeEntry) issues.push("active-state-entry-stale");
			return {
				status: issues.length === 0 ? 0 : 1,
				stdout: print({ ok: issues.length === 0, skill, state, active_entry: activeEntry, issues }, parsed.json),
				stderr: "",
			};
		}
		const existing = await readWorkflowState(cwd, skill, { sessionId: parsed.sessionId });
		if (!existing) throw new Error(`workflow state not found: ${skill}`);
		const state = await clearWorkflowState(
			cwd,
			skill,
			{ current_phase: clearWorkflowPhase(skill) },
			{
				sessionId: parsed.sessionId,
			},
		);
		return { status: 0, stdout: print({ ok: true, skill, state }, parsed.json), stderr: "" };
	} catch (error) {
		return { status: 1, stdout: "", stderr: `${error instanceof Error ? error.message : String(error)}\n` };
	}
}
