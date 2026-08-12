import { resolvePiCommand } from "@tsuuanmi/pi/tmux";
import { describe, expect, test } from "vitest";
import { buildTmuxSubagentLaunchPlan, PI_SUBAGENT_TMUX_TARGET_KIND_ENV } from "#orchestrator/subagent/tmux-launch";

describe("subagent tmux launch", () => {
	test("preserves the runtime loader when rebuilding the pi command", () => {
		expect(
			resolvePiCommand({
				cwd: "/repo/project",
				argv: ["/usr/bin/node", "/repo/packages/pi/src/cli/cli.ts"],
				execPath: "/usr/bin/node",
				execArgv: ["--import", "tsx/loader"],
			}),
		).toEqual(["/usr/bin/node", "--import", "tsx/loader", "/repo/packages/pi/src/cli/cli.ts"]);
	});

	test("builds a visible worker pane without prompt or tool payload arguments", () => {
		const plan = buildTmuxSubagentLaunchPlan({
			cwd: "/repo/project",
			subagentId: "subagent-demo",
			requestPath: "/repo/project/.pi/session/state/subagent/subagent-demo/request.json",
			env: { TMUX: "/tmp/tmux-1000/default,1,0" },
			argv: ["/usr/bin/node", "/usr/local/bin/pi"],
			execPath: "/usr/bin/node",
			tmuxCommand: "tmux",
		});

		expect(plan.visibleByDefault).toBe(true);
		expect(plan.launchArgs.slice(0, 4)).toEqual(["split-window", "-v", "-c", "/repo/project"]);
		expect(plan.launchArgs).toContain("-P");
		expect(plan.launchArgs).toContain("-F");
		expect(plan.innerCommand).toContain(PI_SUBAGENT_TMUX_TARGET_KIND_ENV);
		expect(plan.innerCommand).toContain("'subagent-worker'");
		expect(plan.innerCommand).toContain("/request.json'");
		expect(plan.innerCommand).not.toContain("Plan the project");
		expect(plan.innerCommand).not.toContain("bash");
		expect(plan.requestPath.endsWith("request.json")).toBe(true);
	});
});
