import type { AgentMessage, Model, StreamFunction, ThinkingLevel } from "@tsuuanmi/pi-agent";
import { convertToLlm, SUMMARIZATION_SYSTEM_PROMPT, serializeConversation } from "@tsuuanmi/pi-agent";
import type { AssistantMessage, Context, StreamOptions } from "@tsuuanmi/pi-ai";
import { complete } from "@tsuuanmi/pi-ai";

interface SummaryRequest {
	model: Model<any>;
	messages: AgentMessage[];
	instructions: string;
	maxTokens: number;
	apiKey?: string;
	headers?: Record<string, string>;
	env?: Record<string, string>;
	signal?: AbortSignal;
	thinkingLevel?: ThinkingLevel;
	stream?: StreamFunction;
}

const SUMMARY_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const UPDATE_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const TURN_PREFIX_PROMPT = `This is the PREFIX of a turn that was too large to keep. The SUFFIX (recent work) is retained.

Summarize the prefix to provide context for the retained suffix:

## Original Request
[What did the user ask for in this turn?]

## Early Progress
- [Key decisions and work done in the prefix]

## Context for Suffix
- [Information needed to understand the kept recent work]

Be concise. Focus on what's needed to understand the kept suffix.`;

function optionsFor(request: SummaryRequest): StreamOptions {
	const options: StreamOptions = {
		maxTokens: request.maxTokens,
		signal: request.signal,
		apiKey: request.apiKey,
		headers: request.headers,
		env: request.env,
	};
	if (request.model.reasoning && request.thinkingLevel && request.thinkingLevel !== "off") {
		options.reasoning = request.thinkingLevel;
	}
	return options;
}

/** Run one serialized conversation summarization request. */
export async function summarize(request: SummaryRequest): Promise<AssistantMessage> {
	const conversation = serializeConversation(convertToLlm(request.messages));
	const prompt = `<conversation>\n${conversation}\n</conversation>\n\n${request.instructions}`;
	const messages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: prompt }],
			timestamp: Date.now(),
		},
	];
	const context: Context = { systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages };
	const options = optionsFor(request);

	if (!request.stream) return complete(request.model, context, options);
	return (await request.stream(request.model, context, options)).result();
}

export function summaryText(response: AssistantMessage): string {
	return response.content
		.filter((content): content is { type: "text"; text: string } => content.type === "text")
		.map((content) => content.text)
		.join("\n");
}

/** Generate the main iterative context summary. */
export async function generateSummary(
	messages: AgentMessage[],
	model: Model<any>,
	reserveTokens: number,
	apiKey: string | undefined,
	headers?: Record<string, string>,
	signal?: AbortSignal,
	customInstructions?: string,
	previousSummary?: string,
	thinkingLevel?: ThinkingLevel,
	stream?: StreamFunction,
	env?: Record<string, string>,
): Promise<string> {
	const maxTokens = Math.min(
		Math.floor(0.8 * reserveTokens),
		model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY,
	);
	let instructions = previousSummary ? UPDATE_PROMPT : SUMMARY_PROMPT;
	if (customInstructions) instructions = `${instructions}\n\nAdditional focus: ${customInstructions}`;
	if (previousSummary) instructions = `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n${instructions}`;

	const response = await summarize({
		model,
		messages,
		instructions,
		maxTokens,
		apiKey,
		headers,
		env,
		signal,
		thinkingLevel,
		stream,
	});
	if (response.stopReason === "error") {
		throw new Error(`Summarization failed: ${response.errorMessage || "Unknown error"}`);
	}
	return summaryText(response);
}

/** Generate the summary for the retained suffix of a split turn. */
export async function generateTurnPrefixSummary(
	messages: AgentMessage[],
	model: Model<any>,
	reserveTokens: number,
	apiKey: string | undefined,
	headers?: Record<string, string>,
	env?: Record<string, string>,
	signal?: AbortSignal,
	thinkingLevel?: ThinkingLevel,
	stream?: StreamFunction,
): Promise<string> {
	const maxTokens = Math.min(
		Math.floor(0.5 * reserveTokens),
		model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY,
	);
	const response = await summarize({
		model,
		messages,
		instructions: TURN_PREFIX_PROMPT,
		maxTokens,
		apiKey,
		headers,
		env,
		signal,
		thinkingLevel,
		stream,
	});
	if (response.stopReason === "error") {
		throw new Error(`Turn prefix summarization failed: ${response.errorMessage || "Unknown error"}`);
	}
	return summaryText(response);
}
