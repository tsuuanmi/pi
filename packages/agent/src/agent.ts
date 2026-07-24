import type { LlmMessage } from "@tsuuanmi/pi-ai";
// Architecture adapted from open-multi-agent (MIT).
import type { AgentConfig, AgentRunOptions, AgentRunResult, TaskExecutionContext } from "#agent/types";

export class Agent {
	readonly name: string;
	readonly instructions?: string;
	readonly model?: string;
	readonly capabilities: readonly string[];
	readonly maxConcurrentTasks: number;
	private readonly config: AgentConfig;

	constructor(config: AgentConfig) {
		this.name = config.name;
		this.instructions = config.instructions;
		this.model = config.model;
		this.capabilities = [...(config.capabilities ?? [])];
		this.maxConcurrentTasks = config.maxConcurrentTasks ?? 1;
		this.config = { ...config, capabilities: this.capabilities, tools: [...(config.tools ?? [])] };
	}

	get tools() {
		return this.config.tools ?? [];
	}

	async run(prompt: string, options: AgentRunOptions = {}): Promise<AgentRunResult> {
		const messages: LlmMessage[] = [];
		if (this.instructions) messages.push({ role: "system", content: this.instructions });
		messages.push({ role: "user", content: prompt });
		try {
			const response = await this.config.adapter.complete(messages, {
				model: this.model,
				signal: options.signal,
				metadata: options.metadata,
				tools: this.tools,
			});
			return { success: true, output: response.content, response };
		} catch (error) {
			return { success: false, output: error instanceof Error ? error.message : String(error), error };
		}
	}

	async executeTask(context: TaskExecutionContext, options: AgentRunOptions = {}): Promise<AgentRunResult> {
		const dependencyText = context.completedDependencies
			.map((task) => `## ${task.title}\n${task.result ?? ""}`)
			.join("\n\n");
		const prompt = [
			`# Task: ${context.task.title}`,
			context.task.description,
			dependencyText ? `# Completed dependencies\n${dependencyText}` : undefined,
		]
			.filter(Boolean)
			.join("\n\n");
		return this.run(prompt, options);
	}
}
