import { selectConfig } from "#pi/cli/config-selector";
import { reportSettingsErrors } from "#pi/cli/settings";
import { resolveResources } from "#pi/loader/discovery";
import { getAgentDir } from "#pi/loader/paths";
import { DefaultPackageManager } from "#pi/package/manager";
import { SettingsManager } from "#pi/settings/settings-manager";

export async function handleConfigCommand(args: string[]): Promise<boolean> {
	if (args[0] !== "config") {
		return false;
	}

	const cwd = process.cwd();
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(cwd, agentDir);
	reportSettingsErrors(settingsManager, "config command");
	const packageManager = new DefaultPackageManager({
		cwd,
		agentDir,
		settingsManager,
		commandOutput: "inherit",
	});
	const resolvedPaths = await resolveResources(packageManager, {
		cwd,
		agentDir,
		settingsManager,
	});

	await selectConfig({
		resolvedPaths,
		settingsManager,
		cwd,
		agentDir,
	});

	process.exit(0);
}
