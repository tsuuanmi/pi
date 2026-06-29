import { basename, extname } from "node:path";
import type { ExtensionFactory } from "../api/types.ts";
import { getAgentDir } from "../core/config/config.ts";
import { DefaultPackageManager, type ResolvedResource } from "../core/package-manager/package-manager.ts";
import { SettingsManager } from "../core/settings/settings-manager.ts";

export interface PackageCommandContext {
	cwd: string;
	agentDir: string;
	extensionFactories?: ExtensionFactory[];
}

export interface PackageCommandModule {
	handlePackageCommand?: (args: string[], context: PackageCommandContext) => Promise<boolean> | boolean;
}

function commandName(resource: ResolvedResource): string {
	return basename(resource.path, extname(resource.path));
}

export async function dispatchPreSessionPackageCommand(
	args: string[],
	options?: { extensionFactories?: ExtensionFactory[] },
): Promise<boolean> {
	const [requested] = args;
	if (!requested) return false;

	const cwd = process.cwd();
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
	const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
	const resolved = await packageManager.resolve(async () => "skip");
	const candidates = resolved.commands.filter((resource) => resource.enabled && commandName(resource) === requested);
	if (candidates.length === 0) return false;

	const [selected, ...collisions] = candidates;
	for (const collision of collisions) {
		console.error(
			`Warning: command "${requested}" from ${collision.metadata.source} ignored; already provided by ${selected.metadata.source}`,
		);
	}

	const mod = (await import(selected.path)) as PackageCommandModule;
	const handler = mod.handlePackageCommand;
	if (!handler) {
		throw new Error(`Package command "${requested}" (${selected.path}) does not export handlePackageCommand`);
	}
	return handler(args, { cwd, agentDir, extensionFactories: options?.extensionFactories });
}
