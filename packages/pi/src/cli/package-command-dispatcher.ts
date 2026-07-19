import { basename, extname } from "node:path";
import type { ExtensionFactory } from "#pi/api/types";
import { getAgentDir } from "#pi/config/config";
import { DefaultPackageManager, type ResolvedResource } from "#pi/package-manager/package-manager";
import { SettingsManager } from "#pi/settings/settings-manager";

// Register the agent-layer SubagentManagerFactory at module load so the detached
// RuntimeOwner (which loads pi via the pi entry) can look it up and
// route pi workflow subagents verbs to a real SubagentManager. Side-effect import
// only; pi-workflows never imports this.
import "#pi/subagents/subagent-manager-factory-registration";

export interface PackageCommandContext {
	cwd: string;
	agentDir: string;
	extensionFactories?: ExtensionFactory[];
}

/**
 * A command resource module exported by a package and dispatched by
 * `dispatchPreSessionPackageCommand`. The dispatcher resolves command
 * resources by filename (`basename(resource.path)`), dynamically imports the
 * module, and calls `handlePackageCommand(args, context)`.
 *
 * Note: this `handlePackageCommand` is the package-command dispatcher contract
 * and is unrelated to the `handlePackageCommand` in `package-manager-cli.ts`
 * (the install/remove/update/list handler). Same name, different modules.
 */
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
	// Early-bail for flag-first invocations (e.g. `pi --version`, `pi --help`,
	// `pi -p ...`): these are not subcommands, so skip full package resolution
	// and let `parseArgs` handle them. Zero behavior change on the success path.
	if (!requested || requested.startsWith("-")) return false;

	const cwd = process.cwd();
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(cwd, agentDir);
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
