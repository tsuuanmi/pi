/**
 * Register the Pi subagent manager for detached runtime owners.
 *
 * The manager creates an isolated session for each spawn. The owner provides
 * runtime inputs and does not create a second parent session.
 */
import { registerSubagentManagerFactory, type SubagentManagerFactoryContext } from "@tsuuanmi/pi-agent";
import { createAgentSessionServices } from "#pi/runtime/agent-session-services";
import { SubagentManager } from "#pi/subagents/manager";

function toExtensionFlagValues(
	value: SubagentManagerFactoryContext["extensionFlagValues"],
): Map<string, boolean | string> | undefined {
	if (!value) return undefined;
	const map = new Map<string, boolean | string>();
	for (const [key, flag] of Object.entries(value)) {
		if (typeof flag === "boolean" || typeof flag === "string") map.set(key, flag);
	}
	return map.size > 0 ? map : undefined;
}

function toResourceLoaderOptions(
	value: SubagentManagerFactoryContext["resourceLoaderOptions"],
): Record<string, unknown> | undefined {
	if (!value) return undefined;
	return value;
}

/**
 * Build the concrete Pi subagent manager from detached runtime inputs.
 */
registerSubagentManagerFactory(async (context) => {
	const services = await createAgentSessionServices({
		cwd: context.cwd,
		agentDir: context.agentDir,
		extensionFlagValues: toExtensionFlagValues(context.extensionFlagValues),
		resourceLoaderOptions: toResourceLoaderOptions(context.resourceLoaderOptions) as Parameters<
			typeof createAgentSessionServices
		>[0]["resourceLoaderOptions"],
	});
	return new SubagentManager(services);
});
