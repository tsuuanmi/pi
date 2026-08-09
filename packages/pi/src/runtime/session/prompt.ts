import type {
	Agent,
	CustomMessage,
	Message,
	StructuredOutputOptions,
	StructuredOutputResult,
} from "@tsuuanmi/pi-agent";
import {
	createStructuredOutputPrompt,
	createStructuredOutputRepairPrompt,
	getStructuredOutputRetryLimit,
	parseStructuredOutput,
} from "@tsuuanmi/pi-agent";
import type { AssistantMessage, Model, TextContent } from "@tsuuanmi/pi-ai";
import type { Static, TSchema } from "typebox";
import { formatNoApiKeyFoundMessage, formatNoModelSelectedMessage } from "#pi/auth/guidance";
import type { BuildSystemPromptOptions } from "#pi/loader/agents/system-prompt";
import type { ModelRegistry } from "#pi/loader/model-registry";
import type { PromptTemplate } from "#pi/loader/prompt-templates";
import type { ExtensionRunner } from "#pi/runtime/extensions/runner";
import { expandPromptTemplate } from "#pi/runtime/prompt-expansion";
import type { AgentSessionEvent, PromptOptions } from "#pi/runtime/session/types";
import type { SessionManager } from "#pi/session/manager";

function getAgentText(message: AssistantMessage): string {
	return message.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("\n");
}

export interface PromptHost {
	readonly agent: Agent;
	readonly sessionManager: SessionManager;
	readonly modelRegistry: ModelRegistry;
	readonly extensionRunner: ExtensionRunner;
	readonly model: Model<any> | undefined;
	readonly isStreaming: boolean;
	readonly promptTemplates: ReadonlyArray<PromptTemplate>;
	readonly baseSystemPrompt: string;
	readonly baseSystemPromptOptions: BuildSystemPromptOptions;
	expandSkillCommand(text: string): string;
	findLastAgentMessage(): AssistantMessage | undefined;
	runAgentPrompt(messages: Message | Message[]): Promise<void>;
	handlePostAgentRun(): Promise<boolean>;
	checkCompaction(message: AssistantMessage, skipAbortedCheck?: boolean): Promise<boolean>;
	flushBash(): void;
	emit(event: AgentSessionEvent): void;
}

export class PromptController {
	private readonly host: PromptHost;
	private steeringMessages: string[] = [];
	private followUpMessages: string[] = [];
	private pendingNextTurnMessages: CustomMessage[] = [];

	constructor(host: PromptHost) {
		this.host = host;
	}

	removeQueuedMessage(text: string): void {
		const steeringIndex = this.steeringMessages.indexOf(text);
		if (steeringIndex !== -1) {
			this.steeringMessages.splice(steeringIndex, 1);
			this.emitQueueUpdate();
			return;
		}

		const followUpIndex = this.followUpMessages.indexOf(text);
		if (followUpIndex !== -1) {
			this.followUpMessages.splice(followUpIndex, 1);
			this.emitQueueUpdate();
		}
	}

	/**
	 * Send a prompt to the agent.
	 * - Handles extension commands (registered via pi.registerCommand) immediately, even during streaming
	 * - Expands file-based prompt templates by default
	 * - During streaming, queues via steer() or followUp() based on streamingBehavior option
	 * - Validates model and API key before sending (when not streaming)
	 * @throws Error if streaming and no streamingBehavior specified
	 * @throws Error if no model selected or no API key available (when not streaming)
	 */
	async promptStructured<TSchemaValue extends TSchema>(
		text: string,
		options: PromptOptions & StructuredOutputOptions<TSchemaValue>,
	): Promise<StructuredOutputResult<Static<TSchemaValue>>> {
		const retryLimit = getStructuredOutputRetryLimit(options.retryOnInvalid);
		let prompt = createStructuredOutputPrompt(text, options);
		let result: StructuredOutputResult<Static<TSchemaValue>> | undefined;

		for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
			await this.prompt(prompt, options);
			const agentMessage = this.host.findLastAgentMessage();
			const rawText = agentMessage ? getAgentText(agentMessage) : "";
			result = parseStructuredOutput(rawText, options.schema);
			const event = {
				type: "structured_output" as const,
				ok: result.ok,
				attempt: attempt + 1,
				...(result.ok
					? { preview: result.jsonText.slice(0, 240) }
					: { error: result.error, issues: result.issues, preview: rawText.slice(0, 240) }),
			};
			this.host.emit(event);
			await this.host.extensionRunner.emit(event);
			if (result.ok || attempt === retryLimit) return result;
			prompt = createStructuredOutputPrompt(createStructuredOutputRepairPrompt(result), options);
		}

		return result ?? { ok: false, error: "Structured output did not run", rawText: "" };
	}

	async prompt(text: string, options?: PromptOptions): Promise<void> {
		const expandPromptTemplates = options?.expandPromptTemplates ?? true;
		const preflightResult = options?.preflightResult;
		let messages: Message[] | undefined;

		try {
			// Handle extension commands first (execute immediately, even during streaming)
			// Extension commands manage their own LLM interaction via pi.sendMessage()
			if (expandPromptTemplates && text.startsWith("/")) {
				const handled = await this.tryExecuteExtensionCommand(text);
				if (handled) {
					// Extension command executed, no prompt to send
					preflightResult?.(true);
					return;
				}
			}

			// Emit input event for extension interception (before skill/template expansion)
			let currentText = text;
			if (this.host.extensionRunner.hasHandlers("input")) {
				const inputResult = await this.host.extensionRunner.emitInput(
					currentText,
					options?.source ?? "interactive",
					this.host.isStreaming ? options?.streamingBehavior : undefined,
				);
				if (inputResult.action === "handled") {
					preflightResult?.(true);
					return;
				}
				if (inputResult.action === "transform") {
					currentText = inputResult.text;
				}
			}

			// Expand skill commands (/skill:name args) and prompt templates (/template args)
			let expandedText = currentText;
			if (expandPromptTemplates) {
				expandedText = this.expandSkillCommand(expandedText);
				expandedText = expandPromptTemplate(expandedText, [...this.host.promptTemplates]);
			}

			// If streaming, queue via steer() or followUp() based on option
			if (this.host.isStreaming) {
				if (!options?.streamingBehavior) {
					throw new Error(
						"Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.",
					);
				}
				if (options.streamingBehavior === "followUp") {
					await this.queueFollowUp(expandedText);
				} else {
					await this.queueSteer(expandedText);
				}
				preflightResult?.(true);
				return;
			}

			// Flush any pending bash messages before the new prompt
			this.host.flushBash();

			// Validate model
			if (!this.host.model) {
				throw new Error(formatNoModelSelectedMessage());
			}

			if (!this.host.modelRegistry.hasConfiguredAuth(this.host.model)) {
				const isOAuth = this.host.modelRegistry.isUsingOAuth(this.host.model);
				if (isOAuth) {
					throw new Error(
						`Authentication failed for "${this.host.model.provider}". ` +
							`Credentials may have expired or network is unavailable. ` +
							`Run '/account add ${this.host.model.provider}' to re-authenticate.`,
					);
				}
				throw new Error(formatNoApiKeyFoundMessage(this.host.model.provider));
			}

			// Check if we need to compact before sending (catches aborted responses)
			const lastAgent = this.host.findLastAgentMessage();
			if (lastAgent && (await this.host.checkCompaction(lastAgent, false))) {
				try {
					await this.host.agent.continue();
					while (await this.host.handlePostAgentRun()) {
						await this.host.agent.continue();
					}
				} finally {
					this.host.flushBash();
				}
			}

			// Build messages array (custom message if any, then user message)
			messages = [];

			// Add user message
			messages.push({
				role: "user",
				content: [{ type: "text", text: expandedText }],
				timestamp: Date.now(),
			});

			// Inject any pending "nextTurn" messages as context alongside the user message
			for (const msg of this.pendingNextTurnMessages) {
				messages.push(msg);
			}
			this.pendingNextTurnMessages = [];

			// Emit before_agent_start extension event
			const result = await this.host.extensionRunner.emitBeforeAgentStart(
				expandedText,
				this.host.baseSystemPrompt,
				this.host.baseSystemPromptOptions,
			);
			// Add all custom messages from extensions
			if (result?.messages) {
				for (const msg of result.messages) {
					messages.push({
						role: "custom",
						customType: msg.customType,
						content: msg.content,
						display: msg.display,
						details: msg.details,
						timestamp: Date.now(),
					});
				}
			}
			// Apply extension-modified system prompt, or reset to base
			if (result?.systemPrompt) {
				this.host.agent.state.systemPrompt = result.systemPrompt;
			} else {
				// Ensure we're using the base prompt (in case previous turn had modifications)
				this.host.agent.state.systemPrompt = this.host.baseSystemPrompt;
			}
		} catch (error) {
			preflightResult?.(false);
			throw error;
		}

		if (!messages) {
			return;
		}

		preflightResult?.(true);
		await this.host.runAgentPrompt(messages);
	}

	/**
	 * Try to execute an extension command. Returns true if command was found and executed.
	 */
	private async tryExecuteExtensionCommand(text: string): Promise<boolean> {
		// Parse command name and args
		const spaceIndex = text.indexOf(" ");
		const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
		const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);

		const command = this.host.extensionRunner.getCommand(commandName);
		if (!command) return false;

		// Get command context from extension runner (includes session control methods)
		const ctx = this.host.extensionRunner.createCommandContext();

		try {
			await command.handler(args, ctx);
			return true;
		} catch (err) {
			// Emit error via extension runner
			this.host.extensionRunner.emitError({
				extensionPath: `command:${commandName}`,
				event: "command",
				error: err instanceof Error ? err.message : String(err),
			});
			return true;
		}
	}

	/**
	 * Expand skill commands (/skill:name args) to their full content.
	 * Returns the expanded text, or the original text if not a skill command or skill not found.
	 * Emits errors via extension runner if file read fails.
	 */
	private expandSkillCommand(text: string): string {
		return this.host.expandSkillCommand(text);
	}

	/**
	 * Queue a steering message while the agent is running.
	 * Delivered after the current assistant turn finishes executing its tool calls,
	 * before the next LLM call.
	 * Expands skill commands and prompt templates. Errors on extension commands.
	 * @throws Error if text is an extension command
	 */
	async steer(text: string): Promise<void> {
		// Check for extension commands (cannot be queued)
		if (text.startsWith("/")) {
			this.throwIfExtensionCommand(text);
		}

		// Expand skill commands and prompt templates
		let expandedText = this.expandSkillCommand(text);
		expandedText = expandPromptTemplate(expandedText, [...this.host.promptTemplates]);

		await this.queueSteer(expandedText);
	}

	/**
	 * Queue a follow-up message to be processed after the agent finishes.
	 * Delivered only when agent has no more tool calls or steering messages.
	 * Expands skill commands and prompt templates. Errors on extension commands.
	 * @throws Error if text is an extension command
	 */
	async followUp(text: string): Promise<void> {
		// Check for extension commands (cannot be queued)
		if (text.startsWith("/")) {
			this.throwIfExtensionCommand(text);
		}

		// Expand skill commands and prompt templates
		let expandedText = this.expandSkillCommand(text);
		expandedText = expandPromptTemplate(expandedText, [...this.host.promptTemplates]);

		await this.queueFollowUp(expandedText);
	}

	/**
	 * Internal: Queue a steering message (already expanded, no extension command check).
	 */
	private async queueSteer(text: string): Promise<void> {
		this.steeringMessages.push(text);
		this.emitQueueUpdate();
		this.host.agent.steer({
			role: "user",
			content: [{ type: "text", text }],
			timestamp: Date.now(),
		});
	}

	/**
	 * Internal: Queue a follow-up message (already expanded, no extension command check).
	 */
	private async queueFollowUp(text: string): Promise<void> {
		this.followUpMessages.push(text);
		this.emitQueueUpdate();
		this.host.agent.followUp({
			role: "user",
			content: [{ type: "text", text }],
			timestamp: Date.now(),
		});
	}

	/**
	 * Throw an error if the text is an extension command.
	 */
	private throwIfExtensionCommand(text: string): void {
		const spaceIndex = text.indexOf(" ");
		const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
		const command = this.host.extensionRunner.getCommand(commandName);

		if (command) {
			throw new Error(
				`Extension command "/${commandName}" cannot be queued. Use prompt() or execute the command when not streaming.`,
			);
		}
	}

	/**
	 * Send a custom message to the session. Creates a CustomMessageEntry.
	 *
	 * Handles three cases:
	 * - Streaming: queues message, processed when loop pulls from queue
	 * - Not streaming + triggerTurn: appends to state/session, starts new turn
	 * - Not streaming + no trigger: appends to state/session, no turn
	 *
	 * @param message Custom message with customType, content, display, details
	 * @param options.triggerTurn If true and not streaming, triggers a new LLM turn
	 * @param options.deliverAs Delivery mode: "steer", "followUp", or "nextTurn"
	 */
	async sendCustomMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void> {
		const appMessage = {
			role: "custom" as const,
			customType: message.customType,
			content: message.content,
			display: message.display,
			details: message.details,
			timestamp: Date.now(),
		} satisfies CustomMessage<T>;
		if (options?.deliverAs === "nextTurn") {
			this.pendingNextTurnMessages.push(appMessage);
		} else if (this.host.isStreaming) {
			if (options?.deliverAs === "followUp") {
				this.host.agent.followUp(appMessage);
			} else {
				this.host.agent.steer(appMessage);
			}
		} else if (options?.triggerTurn) {
			await this.host.runAgentPrompt(appMessage);
		} else {
			this.host.agent.state.messages.push(appMessage);
			this.host.sessionManager.appendCustomMessageEntry(
				message.customType,
				message.content,
				message.display,
				message.details,
			);
			this.host.emit({ type: "message_start", message: appMessage });
			this.host.emit({ type: "message_end", message: appMessage });
		}
	}

	/**
	 * Send a user message to the agent. Always triggers a turn.
	 * When the agent is streaming, use deliverAs to specify how to queue the message.
	 *
	 * @param content User message content (string or content array)
	 * @param options.deliverAs Delivery mode when streaming: "steer" or "followUp"
	 */
	async sendUserMessage(
		content: string | TextContent[],
		options?: { deliverAs?: "steer" | "followUp" },
	): Promise<void> {
		// Normalize content to text string
		let text: string;

		if (typeof content === "string") {
			text = content;
		} else {
			text = content
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("\n");
		}

		// Use prompt() with expandPromptTemplates: false to skip command handling and template expansion
		await this.prompt(text, {
			expandPromptTemplates: false,
			streamingBehavior: options?.deliverAs,
			source: "extension",
		});
	}

	/**
	 * Clear all queued messages and return them.
	 * Useful for restoring to editor when user aborts.
	 * @returns Object with steering and followUp arrays
	 */
	clearQueue(): { steering: string[]; followUp: string[] } {
		const steering = [...this.steeringMessages];
		const followUp = [...this.followUpMessages];
		this.steeringMessages = [];
		this.followUpMessages = [];
		this.host.agent.clearAllQueues();
		this.emitQueueUpdate();
		return { steering, followUp };
	}

	/** Number of pending messages (includes both steering and follow-up) */
	get pendingMessageCount(): number {
		return this.steeringMessages.length + this.followUpMessages.length;
	}

	/** Get pending steering messages (read-only) */
	getSteeringMessages(): readonly string[] {
		return this.steeringMessages;
	}

	/** Get pending follow-up messages (read-only) */
	getFollowUpMessages(): readonly string[] {
		return this.followUpMessages;
	}

	private emitQueueUpdate(): void {
		this.host.emit({
			type: "queue_update",
			steering: [...this.steeringMessages],
			followUp: [...this.followUpMessages],
		});
	}
}
