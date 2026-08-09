import type { Tool } from "#agent/tool/tool";

export class ToolRegistry {
	private readonly tools = new Map<string, Tool>();

	constructor(initialTools: Iterable<Tool> = []) {
		this.registerMany(initialTools);
	}

	register(tool: Tool): void {
		if (this.tools.has(tool.name)) {
			throw new Error(`Tool "${tool.name}" is already registered`);
		}
		this.tools.set(tool.name, tool);
	}

	registerMany(tools: Iterable<Tool>): void {
		for (const tool of tools) this.register(tool);
	}

	replace(tool: Tool): void {
		this.tools.set(tool.name, tool);
	}

	replaceMany(tools: Iterable<Tool>): void {
		for (const tool of tools) this.replace(tool);
	}

	get(name: string): Tool | undefined {
		return this.tools.get(name);
	}

	has(name: string): boolean {
		return this.tools.has(name);
	}

	names(): string[] {
		return Array.from(this.tools.keys());
	}

	list(): Tool[] {
		return Array.from(this.tools.values());
	}
}
