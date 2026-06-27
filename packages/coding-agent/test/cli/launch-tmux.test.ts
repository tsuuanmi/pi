import { describe, expect, test } from "vitest";
import { parseArgs } from "../../src/cli/args.ts";
import {
	buildDefaultTmuxLaunchPlan,
	buildPiTmuxWindowTitle,
	launchDefaultTmuxIfNeeded,
	type TmuxSpawnOptions,
	type TmuxSpawnResult,
} from "../../src/cli/launch-tmux.ts";

describe("tmux launch", () => {
	test("builds a detached tmux launch plan for interactive --tmux", () => {
		const plan = buildDefaultTmuxLaunchPlan({
			parsed: parseArgs(["--tmux"]),
			rawArgs: ["--tmux"],
			cwd: "/repo/project",
			env: { PI_TMUX_SESSION: "pi-test" },
			argv: ["/usr/bin/node", "/usr/local/bin/pi"],
			execPath: "/usr/bin/node",
			tty: { stdin: true, stdout: true },
			tmuxAvailable: true,
			currentBranch: "feature/demo",
		});

		expect(plan?.sessionName).toBe("pi-test");
		expect(plan?.newSessionArgs).toEqual([
			"new-session",
			"-d",
			"-s",
			"pi-test",
			"-c",
			"/repo/project",
			"exec env PI_TMUX_LAUNCHED=1 '/usr/local/bin/pi' '--tmux'",
		]);
	});

	test("does not launch for non-interactive modes", () => {
		const plan = buildDefaultTmuxLaunchPlan({
			parsed: parseArgs(["--tmux", "--print", "hello"]),
			rawArgs: ["--tmux", "--print", "hello"],
			cwd: "/repo/project",
			env: {},
			tty: { stdin: true, stdout: true },
			tmuxAvailable: true,
		});

		expect(plan).toBeUndefined();
	});

	test("creates, profiles, and attaches a tmux session", () => {
		const calls: Array<{ command: string; args: string[]; options: TmuxSpawnOptions }> = [];
		const fakeSpawn = (command: string, args: string[], options: TmuxSpawnOptions): TmuxSpawnResult => {
			calls.push({ command, args, options });
			return { exitCode: 0 };
		};

		const launched = launchDefaultTmuxIfNeeded({
			parsed: parseArgs(["--tmux"]),
			rawArgs: ["--tmux"],
			cwd: "/repo/project",
			env: { PI_TMUX_SESSION: "pi-test", PI_MOUSE: "0" },
			argv: ["/usr/bin/node", "/usr/local/bin/pi"],
			execPath: "/usr/bin/node",
			tty: { stdin: true, stdout: true },
			tmuxAvailable: true,
			currentBranch: "main",
			spawnSync: fakeSpawn,
		});

		expect(launched).toBe(true);
		expect(calls.map((call) => call.args[0])).toEqual([
			"new-session",
			"rename-window",
			"set-option",
			"set-option",
			"set-option",
			"set-option",
			"set-option",
			"set-option",
			"set-window-option",
			"attach-session",
		]);
		expect(calls.map((call) => call.args)).toContainEqual(["set-option", "-g", "extended-keys", "on"]);
	});

	test("truncates long branch names in tmux window title", () => {
		expect(buildPiTmuxWindowTitle("/repo/project", `feature/${"x".repeat(80)}`)).toHaveLength(48);
	});
});
