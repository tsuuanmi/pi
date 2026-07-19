/**
 * Subagent manager factory registration.
 *
 * Registers the agent-layer `SubagentManagerFactory` at module load so the
 * detached `RuntimeOwner` (which loads `pi` via the `pi` entry) can
 * look it up and route `pi workflow subagents` verbs to a real `SubagentManager`.
 *
 * Design principle: `pi-workflows` focuses on skills + state (only looks up and
 * routes); subagent management is a reusable agent-layer capability. This module
 * is the agent-layer impl; `pi-workflows` never imports it.
 */
import { registerSubagentManagerFactory, type SubagentManagerFactoryContext } from "@tsuuanmi/pi-agent";
import { createAgentSessionServices } from "#pi/session/agent-session-services";
import { SubagentManager } from "#pi/subagents/subagents";

function toExtensionFlagValues(
	value: SubagentManagerFactoryContext["extensionFlagValues"],
): Map<string, boolean | string> | undefined {
	if (!value) return undefined;
	const map = new Map<string, boolean | string>();
	for (const [k, v] of Object.entries(value)) {
		if (typeof v === "boolean" || typeof v === "string") map.set(k, v);
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
 * Factory: builds `AgentSessionServices` + `new SubagentManager(services)`.
 *
 * Per the approved plan, this does NOT construct a full parent `AgentSession`.
 * The `SubagentManager` hosts the real per-spawn subagent `AgentSession`s
 * internally (each spawn builds its own isolated services + session via
 * `createIsolatedServices`). The owner hosts the agent-layer subagent
 * *capability*, not a second parent session.
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
