import type { AssistantMessage, ToolResultMessage } from "@tsuuanmi/pi-ai";
import type { AgentMessage } from "#agent/messages/types";

export type LoopDetectionAction = "warn" | "stop";

export interface LoopDetectionOptions {
	enabled?: boolean;
	/** Consecutive matching turn signatures required before a loop is reported. Default: 3. */
	maxRepeats?: number;
	/** Maximum recent turn signatures retained for detection. Default: 8. */
	windowSize?: number;
	/** Include normalized assistant text in turn signatures. Default: false. */
	includeText?: boolean;
	/** Include assistant tool-call names and arguments in turn signatures. Default: true. */
	includeToolCalls?: boolean;
	/** Action requested when a loop is detected. Default: "warn". */
	action?: LoopDetectionAction;
}

export interface NormalizedLoopDetectionOptions {
	enabled: boolean;
	maxRepeats: number;
	windowSize: number;
	includeText: boolean;
	includeToolCalls: boolean;
	action: LoopDetectionAction;
}

export interface LoopDetectionTurn {
	message: AssistantMessage;
	toolResults: ToolResultMessage[];
	newMessages: AgentMessage[];
}

export interface LoopDetectionResult {
	detected: boolean;
	action: LoopDetectionAction;
	reason: string;
	repeats: number;
	maxRepeats: number;
	signature: string;
	preview: string;
}

const DEFAULT_LOOP_DETECTION: NormalizedLoopDetectionOptions = {
	enabled: true,
	maxRepeats: 3,
	windowSize: 8,
	includeText: false,
	includeToolCalls: true,
	action: "warn",
};

export function normalizeLoopDetectionOptions(
	options: boolean | LoopDetectionOptions | undefined,
): NormalizedLoopDetectionOptions | undefined {
	if (options === undefined || options === false) return undefined;
	if (options === true) return { ...DEFAULT_LOOP_DETECTION };
	if (options.enabled === false) return undefined;
	const maxRepeats = Math.max(2, Math.floor(options.maxRepeats ?? DEFAULT_LOOP_DETECTION.maxRepeats));
	const requestedWindowSize = Math.floor(options.windowSize ?? DEFAULT_LOOP_DETECTION.windowSize);
	return {
		...DEFAULT_LOOP_DETECTION,
		...options,
		maxRepeats,
		windowSize: Math.max(maxRepeats, requestedWindowSize),
	};
}

export class LoopDetector {
	private readonly options: NormalizedLoopDetectionOptions;
	private readonly signatures: string[] = [];
	private reportedSignature?: string;

	constructor(options: NormalizedLoopDetectionOptions) {
		this.options = options;
	}

	record(turn: LoopDetectionTurn): LoopDetectionResult | undefined {
		const signature = createTurnSignature(turn, this.options);
		if (!signature) return undefined;

		this.signatures.push(signature);
		if (this.signatures.length > this.options.windowSize) {
			this.signatures.splice(0, this.signatures.length - this.options.windowSize);
		}

		const repeats = countTrailingRepeats(this.signatures, signature);
		if (repeats < this.options.maxRepeats) return undefined;
		if (this.reportedSignature === signature && this.options.action === "warn") return undefined;

		this.reportedSignature = signature;
		return {
			detected: true,
			action: this.options.action,
			reason: `Detected ${repeats} repeated agent turns`,
			repeats,
			maxRepeats: this.options.maxRepeats,
			signature,
			preview: signature.length > 240 ? `${signature.slice(0, 237)}...` : signature,
		};
	}
}

function createTurnSignature(turn: LoopDetectionTurn, options: NormalizedLoopDetectionOptions): string | undefined {
	const parts: string[] = [];
	if (options.includeToolCalls) {
		const toolCalls = turn.message.content.filter((content) => content.type === "toolCall");
		if (toolCalls.length > 0) {
			const signatures = toolCalls
				.map((toolCall) => ({
					signature: `${toolCall.name}:${stableStringify(toolCall.arguments)}`,
					sortKey: `${toolCall.name}:${stableStringify(toolCall.arguments)}:${toolCall.id}`,
				}))
				.sort((left, right) => left.sortKey.localeCompare(right.sortKey))
				.map((toolCall) => toolCall.signature);
			parts.push(`tools:${signatures.join("|")}`);
		}
	}
	if (options.includeText) {
		const text = turn.message.content
			.filter((content) => content.type === "text")
			.map((content) => content.text)
			.join("\n")
			.replace(/\s+/g, " ")
			.trim();
		if (text) parts.push(`text:${text.slice(0, 1000)}`);
	}
	return parts.length > 0 ? parts.join("\n") : undefined;
}

function countTrailingRepeats(signatures: string[], signature: string): number {
	let count = 0;
	for (let index = signatures.length - 1; index >= 0; index -= 1) {
		if (signatures[index] !== signature) break;
		count += 1;
	}
	return count;
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
