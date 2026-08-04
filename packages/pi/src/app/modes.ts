import chalk from "chalk";
import { formatNoModelsAvailableMessage } from "#pi/auth/guidance";
import type { Args, Mode } from "#pi/cli/args";
import { InteractiveMode, runPrintMode, runRpcMode } from "#pi/modes/index";
import { restoreStdout } from "#pi/modes/output-guard";
import type { AgentSessionRuntime } from "#pi/runtime/agent-session-runtime";

export type AppMode = "interactive" | "print" | "json" | "rpc";

export interface RunModeOptions {
	appMode: AppMode;
	runtime: AgentSessionRuntime;
	parsed: Args;
	initialMessage?: string;
	migratedProviders: string[];
	modelStartupWarning?: string;
}

function toPrintOutputMode(appMode: AppMode): Exclude<Mode, "rpc"> {
	return appMode === "json" ? "json" : "text";
}

export async function runAppMode(options: RunModeOptions): Promise<void> {
	const { appMode, runtime, parsed, initialMessage, migratedProviders, modelStartupWarning } = options;
	const session = runtime.session;

	if (appMode !== "interactive" && !session.model) {
		console.error(chalk.red(formatNoModelsAvailableMessage()));
		process.exit(1);
	}

	if (appMode === "rpc") {
		await runRpcMode(runtime);
		return;
	}

	if (appMode === "interactive") {
		const interactiveMode = new InteractiveMode(runtime, {
			migratedProviders,
			modelStartupWarning,
			initialMessage,
			initialMessages: parsed.messages,
		});

		await interactiveMode.run();
		return;
	}

	const exitCode = await runPrintMode(runtime, {
		mode: toPrintOutputMode(appMode),
		messages: parsed.messages,
		initialMessage,
	});
	restoreStdout();
	if (exitCode !== 0) {
		process.exitCode = exitCode;
	}
}
