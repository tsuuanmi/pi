import type { AgentHook, AgentRunHookContext, AgentRunResultHookContext } from "#agent/hooks";

export class AgentHookRegistry {
	private readonly hooks = new Map<string, AgentHook>();

	constructor(hooks: readonly AgentHook[] = []) {
		for (const hook of hooks) this.register(hook);
	}

	register(hook: AgentHook): () => void {
		if (!hook.name || hook.name.trim() !== hook.name) {
			throw new Error("Agent hook name must be non-empty and trimmed");
		}
		if (this.hooks.has(hook.name)) {
			throw new Error(`Agent hook already registered: ${hook.name}`);
		}
		if (!hook.beforeRun && !hook.afterRun && !hook.beforeToolCall && !hook.afterToolCall && !hook.prepareNextTurn) {
			throw new Error(`Agent hook has no handlers: ${hook.name}`);
		}

		this.hooks.set(hook.name, hook);
		return () => {
			if (this.hooks.get(hook.name) === hook) this.hooks.delete(hook.name);
		};
	}

	snapshot(): AgentHook[] {
		return [...this.hooks.values()];
	}

	clear(): void {
		this.hooks.clear();
	}
}

export async function runBeforeHooks(
	hooks: readonly AgentHook[],
	context: AgentRunHookContext,
	signal?: AbortSignal,
): Promise<void> {
	for (const hook of hooks) await hook.beforeRun?.(context, signal);
}

export async function runAfterHooks(
	hooks: readonly AgentHook[],
	context: AgentRunResultHookContext,
	signal?: AbortSignal,
): Promise<void> {
	for (const hook of hooks) await hook.afterRun?.(context, signal);
}
