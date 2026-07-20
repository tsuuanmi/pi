import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const SKILL_VERBS = new Set(["deep-interview", "ralplan", "team", "ultragoal"]);

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

export function usage(): string {
	return `Usage:
  pi workflow state <skill> read --json
  pi workflow start --input '{"workspace":".","sessionId":"optional","detach":true}' --json
  pi workflow submit --input '{"sessionId":"h-...","prompt":"work"}' --json
  pi workflow observe --input '{"sessionId":"h-..."}' --json
  pi workflow classify --input '{"sessionId":"h-..."}' --json
  pi workflow recover --input '{"sessionId":"h-..."}' --json
  pi workflow validate --input '{"sessionId":"h-...","checks":[{"name":"check","command":"npm run check"}]}' --json
  pi workflow finalize --input '{"sessionId":"h-..."}' --json
  pi workflow operate --input '{"sessionId":"h-...","goal":"...","maxIterations":10}' --json
  pi workflow gc [--prune] [--dry-run] --json
  pi workflow events --input '{"sessionId":"h-..."}' --json
  pi workflow retire --input '{"sessionId":"h-..."}' --json
  pi workflow <deep-interview|ralplan|team|ultragoal> <action> --input '{...}' --json
  pi workflow <deep-interview|ralplan|team|ultragoal> <action> --input-file ./payload.json --json

State root: PI_HARNESS_STATE_ROOT or <workspace>/.pi/state/harness
`;
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
		if (SKILL_VERBS.has(parsed.verb) && parsed.subverb === undefined) {
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
