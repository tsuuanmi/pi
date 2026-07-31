import type { ExtensionFactory } from "#pi/runtime/extension-types";
import { dispatchPreSessionPackageCommand } from "#pi/cli/package-command-dispatcher";
import { handleConfigCommand, handlePackageCommand } from "#pi/cli/package-manager";
import { runSubagentWorkerMain } from "#pi/subagents/tmux-worker";

export interface StartupCommandOptions {
	extensionFactories?: ExtensionFactory[];
}

export async function runStartupCommands(args: string[], options?: StartupCommandOptions): Promise<boolean> {
	if (await runSubagentWorkerMain(args)) return true;

	if (await handlePackageCommand(args, { extensionFactories: options?.extensionFactories })) {
		const exitCode = process.exitCode ?? 0;
		process.exit(exitCode);
		return true;
	}

	if (await handleConfigCommand(args, { extensionFactories: options?.extensionFactories })) {
		return true;
	}

	if (await dispatchPreSessionPackageCommand(args, { extensionFactories: options?.extensionFactories })) {
		const exitCode = process.exitCode ?? 0;
		process.exit(exitCode);
		return true;
	}

	return false;
}
