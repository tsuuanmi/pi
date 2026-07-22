import {
	isTopLevelWorkflowVerb,
	isWorkflowSkill,
	type ParsedWorkflowCommand,
	parseWorkflowArgs,
	parseWorkflowInput,
	skillUsage,
	usage,
} from "#workflows/commands/workflow/args";
import {
	classify,
	events,
	finalize,
	gc,
	observe,
	operateCmd,
	recover,
	retire,
	runOwner,
	start,
	submit,
	validate,
} from "#workflows/commands/workflow/runtime";
import { deepInterviewVerb, ralplanVerb, teamVerb, ultragoalVerb } from "#workflows/commands/workflow/skill-verbs";
import { runStateCommand } from "#workflows/commands/workflow/state";
import type { WorkflowCommandResult } from "#workflows/commands/workflow/types";

export { runStateCommand } from "#workflows/commands/workflow/state";

async function dispatch(parsed: ParsedWorkflowCommand, cwd: string): Promise<WorkflowCommandResult> {
	if (parsed.help) {
		if (isWorkflowSkill(parsed.verb)) return { status: 0, stdout: skillUsage(parsed.verb), stderr: "" };
		if (parsed.verb === "observe" || isTopLevelWorkflowVerb(parsed.verb)) {
			return { status: 0, stdout: usage(), stderr: "" };
		}
		throw new Error(`unknown workflow skill or verb for help: ${parsed.verb}`);
	}
	if (parsed.verb !== "gc" && (parsed.prune || parsed.dryRun)) {
		throw new Error(`--prune/--dry-run are only supported for pi workflow gc, not ${parsed.verb}`);
	}
	const input = await parseWorkflowInput(parsed, cwd);
	if (parsed.verb === "start") return start(input, parsed.json);
	if (parsed.verb === "owner") return runOwner(input);
	if (parsed.verb === "submit") return submit(input, parsed.json);
	if (parsed.verb === "observe") return observe(input, parsed.json);
	if (parsed.verb === "classify") return classify(input, parsed.json);
	if (parsed.verb === "recover") return recover(input, parsed.json);
	if (parsed.verb === "validate") return validate(input, parsed.json);
	if (parsed.verb === "finalize") return finalize(input, parsed.json);
	if (parsed.verb === "operate") return operateCmd(input, parsed.json);
	if (parsed.verb === "gc") return gc({ prune: parsed.prune, dryRun: parsed.dryRun, json: parsed.json, input, cwd });
	if (parsed.verb === "events") return events(input, parsed.json);
	if (parsed.verb === "retire") return retire(input, parsed.json);
	if (parsed.verb === "deep-interview") return deepInterviewVerb(parsed.subverb, input, parsed.json, cwd);
	if (parsed.verb === "ralplan") return ralplanVerb(parsed.subverb, input, parsed.json, cwd);
	if (parsed.verb === "team") return teamVerb(parsed.subverb, input, parsed.json, cwd);
	if (parsed.verb === "ultragoal") return ultragoalVerb(parsed.subverb, input, parsed.json, cwd);
	throw new Error(`unsupported pi workflow verb: ${parsed.verb}`);
}

export async function runWorkflowCommand(args: string[], cwd = process.cwd()): Promise<WorkflowCommandResult> {
	try {
		if (args[0] === "state") return await runStateCommand(args.slice(1), cwd);
		return await dispatch(parseWorkflowArgs(args), cwd);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { status: 1, stdout: "", stderr: `Error: ${message}\n` };
	}
}

export async function handleWorkflowCommand(args: string[]): Promise<boolean> {
	if (args[0] !== "workflow") return false;
	const result = await runWorkflowCommand(args.slice(1));
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exitCode = result.status;
	return true;
}

/**
 * Dispatcher contract entry point.
 *
 * `pi`'s package-command dispatcher (`dispatchPreSessionPackageCommand`)
 * dynamically imports this command resource and calls `handlePackageCommand`.
 * It passes the full args (with `args[0] === "workflow"`), so we delegate to
 * `handleWorkflowCommand`, which performs the verb check and I/O. `ctx` is
 * provided by the dispatcher but unused here (handlers derive `cwd` from
 * `process.cwd()`); kept optional for contract conformance.
 */
export async function handlePackageCommand(args: string[], _ctx?: unknown): Promise<boolean> {
	return handleWorkflowCommand(args);
}
