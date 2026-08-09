import type { Message as LlmMessage, TextContent } from "@tsuuanmi/pi-ai";

export interface BashExecutionMessage {
	role: "bashExecution";
	command: string;
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
	timestamp: number;
	excludeFromContext?: boolean;
}

export interface CustomMessage<T = unknown> {
	role: "custom";
	customType: string;
	content: string | TextContent[];
	display: boolean;
	details?: T;
	timestamp: number;
}

export interface BranchSummaryMessage {
	role: "branchSummary";
	summary: string;
	fromId: string;
	timestamp: number;
}

export interface CompactionSummaryMessage {
	role: "compactionSummary";
	summary: string;
	tokensBefore: number;
	timestamp: number;
}

export interface CustomMessages {
	bashExecution: BashExecutionMessage;
	custom: CustomMessage;
	branchSummary: BranchSummaryMessage;
	compactionSummary: CompactionSummaryMessage;
}

export type AgentMessage = LlmMessage | CustomMessages[keyof CustomMessages];
