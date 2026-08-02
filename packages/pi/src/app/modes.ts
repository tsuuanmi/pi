import chalk from "chalk";
import { formatNoModelsAvailableMessage } from "#pi/auth/auth-guidance";
import type { Args, Mode } from "#pi/cli/args";
import { InteractiveMode, runPrintMode, runRpcMode } from "#pi/modes/index";
import { restoreStdout } from "#pi/modes/output-guard";
import type { AgentSessionRuntime } from "#pi/runtime/runtime";
import { printTimings, time } from "#pi/telemetry/timings";

export type AppMode = "interactive" | "print" | "json" | "rpc";

export interface RunModeOptions {
	appMode: AppMode;
	runtime: AgentSessionRuntime;
	parsed: Args;
	initialMessage?: string;
	migratedProviders: string[];
	modelStartupWarning?: string;
}

function isTruthyEnv(value: string | undefined): boolean {
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function toPrintOutputMode(appMode: AppMode): Exclude<Mode, "rpc"> {
	return appMode === "json" ? "json" : "text";
}

async function waitForOutputDrain(): Promise<void> {
	if (process.stdout.writableLength > 0) {
		await new Promise<void>((resolve) => process.stdout.once("drain", resolve));
	}
	if (process.stderr.writableLength > 0) {
		await new Promise<void>((resolve) => process.stderr.once("drain", resolve));
	}
}

export async function runAppMode(options: RunModeOptions): Promise<void> {
	const { appMode, runtime, parsed, initialMessage, migratedProviders, modelStartupWarning } = options;
	const session = runtime.session;

	if (appMode !== "interactive" && !session.model) {
		console.error(chalk.red(formatNoModelsAvailableMessage()));
		process.exit(1);
	}

	const startupBenchmark = isTruthyEnv(process.env.PI_STARTUP_BENCHMARK);
	if (startupBenchmark && appMode !== "interactive") {
		console.error(chalk.red("Error: PI_STARTUP_BENCHMARK only supports interactive mode"));
		process.exit(1);
	}

	if (appMode === "rpc") {
		printTimings();
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

		if (startupBenchmark) {
			await interactiveMode.init();
			time("interactiveMode.init");
			printTimings();
			interactiveMode.stop();
			await waitForOutputDrain();
			return;
		}

		printTimings();
		await interactiveMode.run();
		return;
	}

	printTimings();
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
