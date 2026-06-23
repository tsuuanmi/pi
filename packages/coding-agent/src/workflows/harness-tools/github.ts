/**
 * GitHub tool — thin wrapper around the `gh` CLI.
 *
 * Runs `gh` subcommands and returns stdout/stderr. Much simpler than
 * gajae-code's gh tool (3700+ LOC with caching, formatting, rendering) but
 * covers the core use case: interact with GitHub from the agent.
 *
 * Requires the `gh` CLI to be installed and authenticated.
 */

import { execFile } from "node:child_process";
import type { AgentToolResult } from "@tsuuanmi/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../../api/types.ts";

export interface GithubToolDetails {
	command: string;
	args: string[];
	exitCode: number | null;
	truncated: boolean;
}

const MAX_GH_OUTPUT = 100_000;

const githubSchema = Type.Object({
	command: Type.String({
		description:
			"The gh subcommand to run (e.g. 'pr', 'issue', 'repo', 'api', 'workflow'). " +
			"The full command will be `gh <command> <args...>`.",
	}),
	args: Type.Optional(
		Type.Array(Type.String(), {
			description: "Arguments to pass to the gh subcommand. Use '--' to separate positional args from flags.",
		}),
	),
	timeout: Type.Optional(Type.Number({ description: "Command timeout in seconds. Default: 60." })),
});

function runGh(
	command: string,
	args: string[],
	timeoutSec: number,
	signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	return new Promise((resolve, reject) => {
		const child = execFile(
			"gh",
			[command, ...args],
			{
				timeout: timeoutSec * 1000,
				maxBuffer: 2 * 1024 * 1024,
				env: { ...process.env },
			},
			(error, stdout, stderr) => {
				if (error && !("code" in error) && error.killed) {
					reject(new Error(`gh ${command} timed out after ${timeoutSec}s`));
					return;
				}
				resolve({
					stdout: stdout ?? "",
					stderr: stderr ?? "",
					exitCode: error && typeof error.code === "number" ? error.code : error ? 1 : 0,
				});
			},
		);
		if (signal) {
			const onAbort = () => child.kill("SIGTERM");
			signal.addEventListener("abort", onAbort, { once: true });
			child.on("exit", () => signal.removeEventListener("abort", onAbort));
		}
	});
}

function truncateOutput(text: string): { text: string; truncated: boolean } {
	if (text.length > MAX_GH_OUTPUT) {
		return { text: text.slice(0, MAX_GH_OUTPUT), truncated: true };
	}
	return { text, truncated: false };
}

export function createGithubToolDefinition(): ToolDefinition<typeof githubSchema, GithubToolDetails> {
	return {
		name: "github",
		label: "GitHub (gh CLI)",
		description:
			"Run GitHub CLI (`gh`) commands. Requires `gh` to be installed and authenticated. " +
			"Examples: command='pr' args=['list'], command='issue' args=['view', '123'], " +
			"command='api' args=['repos/owner/repo/pulls']. Output is truncated to 100KB.",
		promptSnippet: "Run gh CLI commands for GitHub operations",
		promptGuidelines: [
			"Use github to interact with GitHub via the gh CLI (issues, PRs, repos, workflows, API calls).",
			"The `gh` CLI must be installed and authenticated. Verify with `gh auth status` if unsure.",
		],
		parameters: githubSchema,
		execute: async (_toolCallId, params, signal): Promise<AgentToolResult<GithubToolDetails>> => {
			const p = params as Static<typeof githubSchema>;
			const command = p.command.trim();
			const args = p.args ?? [];
			const timeoutSec = p.timeout ?? 60;

			if (!command) throw new Error("command is required");

			const { stdout, stderr, exitCode } = await runGh(command, args, timeoutSec, signal);

			const { text: truncatedStdout, truncated } = truncateOutput(stdout);
			const output = [
				`$ gh ${command} ${args.join(" ")}`,
				`exit code: ${exitCode}`,
				"",
				truncatedStdout,
				...(stderr.trim() ? [``, `stderr:`, stderr.trim()] : []),
				...(truncated ? ["", "[output truncated]"] : []),
			].join("\n");

			return {
				content: [{ type: "text", text: output }],
				details: { command, args, exitCode, truncated },
			};
		},
	};
}
