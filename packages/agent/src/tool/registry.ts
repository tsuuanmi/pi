import type { AgentTool } from "#agent/tool/types";

export interface ToolRegistry {
	register(tool: AgentTool): void;
	registerMany(tools: Iterable<AgentTool>): void;
	get(name: string): AgentTool | undefined;
	has(name: string): boolean;
	delete(name: string): boolean;
	clear(): void;
	names(): string[];
	list(): AgentTool[];
	toMap(): Map<string, AgentTool>;
}

export interface RegisterToolOptions {
	/** Replace any existing registry contents before registering the provided tools. */
	replace?: boolean;
}

export function createToolRegistry(initialTools: Iterable<AgentTool> = []): ToolRegistry {
	const tools = new Map<string, AgentTool>();

	const registry: ToolRegistry = {
		register(tool) {
			tools.set(tool.name, tool);
		},
		registerMany(nextTools) {
			for (const tool of nextTools) {
				registry.register(tool);
			}
		},
		get(name) {
			return tools.get(name);
		},
		has(name) {
			return tools.has(name);
		},
		delete(name) {
			return tools.delete(name);
		},
		clear() {
			tools.clear();
		},
		names() {
			return Array.from(tools.keys());
		},
		list() {
			return Array.from(tools.values());
		},
		toMap() {
			return new Map(tools);
		},
	};

	registry.registerMany(initialTools);
	return registry;
}

export function registerTool(
	registry: ToolRegistry,
	tools: Iterable<AgentTool>,
	options: RegisterToolOptions = {},
): ToolRegistry {
	if (options.replace) {
		registry.clear();
	}
	registry.registerMany(tools);
	return registry;
}
