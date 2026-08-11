import type { ExtensionFactory } from "#pi/api/extension-types";
import { handleConfigCommand } from "#pi/cli/config";
import { handlePackageCommand } from "#pi/cli/package";
import { dispatchPreSessionPackageCommand } from "#pi/cli/package-dispatcher";

export interface StartupCommandOptions {
	extensionFactories?: ExtensionFactory[];
}

export async function runStartupCommands(args: string[], options?: StartupCommandOptions): Promise<boolean> {
	if (await handlePackageCommand(args)) {
		const exitCode = process.exitCode ?? 0;
		process.exit(exitCode);
		return true;
	}

	if (await handleConfigCommand(args)) {
		return true;
	}

	if (await dispatchPreSessionPackageCommand(args, { extensionFactories: options?.extensionFactories })) {
		const exitCode = process.exitCode ?? 0;
		process.exit(exitCode);
		return true;
	}

	return false;
}
