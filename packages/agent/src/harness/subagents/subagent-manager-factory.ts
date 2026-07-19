/**
 * Subagent manager factory registry.
 *
 * The registration seam that lets `pi-workflows` obtain a `SubagentManager`
 * without depending on `pi`. `pi` registers a factory
 * at module load (which runs in the detached owner process because it loads via
 * the `pi` entry). `pi-workflows`' `RuntimeOwner` looks up the factory at startup
 * and routes `subagents.*` RPC verbs to the built manager.
 *
 * Design principle: workflows = skills + state (only looks up and routes);
 * subagent management is a reusable agent-layer capability. The factory impl
 * (building `AgentSessionServices` + `SubagentManager`) stays in `pi`;
 * only the contract lives here in `pi-agent`.
 */
import type { SubagentManager } from "#agent/harness/subagents/subagent-manager";

export interface SubagentManagerFactoryContext {
	/** Workspace root the owner runs in; the factory derives agent dir/config from it. */
	cwd: string;
	/** Optional explicit agent directory (defaults derived from cwd). */
	agentDir?: string;
	/** Extension flag values to pass through to the services construction. */
	extensionFlagValues?: Record<string, unknown>;
	/** Resource loader options for the services construction. */
	resourceLoaderOptions?: Record<string, unknown>;
	/** Abort signal tied to the owner lifecycle. */
	signal?: AbortSignal;
}

/**
 * Builds a `SubagentManager` from the owner session context. The factory should
 * construct `AgentSessionServices` and return `new SubagentManager(services)` —
 * it must NOT construct a full parent `AgentSession`; the manager hosts the real
 * per-spawn subagent sessions internally.
 */
export type SubagentManagerFactory = (
	context: SubagentManagerFactoryContext,
) => Promise<SubagentManager> | SubagentManager;

let factory: SubagentManagerFactory | undefined;

/** Register the agent-layer subagent manager factory (called by `pi` at module load). */
export function registerSubagentManagerFactory(fn: SubagentManagerFactory): void {
	factory = fn;
}

/** Look up the registered factory (`pi-workflows` calls this at owner startup). Returns undefined if none registered. */
export function getSubagentManagerFactory(): SubagentManagerFactory | undefined {
	return factory;
}

/** Clear the registry (tests only). */
export function clearSubagentManagerFactoryForTests(): void {
	factory = undefined;
}
