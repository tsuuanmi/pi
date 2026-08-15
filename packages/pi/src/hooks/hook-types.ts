import type { AgentMessage, CustomMessage } from "@tsuuanmi/pi-agent";
import type { TextContent } from "@tsuuanmi/pi-ai";
import type { BashOperations } from "#pi/execution/backend";
import type { BashResult } from "#pi/execution/bash";
import type { BuildSystemPromptOptions } from "#pi/loader/agents/system-prompt";
import type { CompactionPreparation, CompactionResult } from "#pi/session/compaction/index";
import type { SessionEntry } from "#pi/session/types";
import type { EditToolDetails } from "#pi/tools/edit";
import type {
	BashToolDetails,
	BashToolInput,
	EditToolInput,
	FindToolDetails,
	FindToolInput,
	GlobToolDetails,
	GlobToolInput,
	GrepToolDetails,
	GrepToolInput,
	LsToolDetails,
	LsToolInput,
	ReadToolDetails,
	ReadToolInput,
	WriteToolInput,
} from "#pi/tools/index";

/** Requests additional resource paths after session startup or reload. */
export interface ResourcesDiscoverHook {
	type: "resources_discover";
	cwd: string;
	reason: "startup" | "reload";
}

export interface ResourcesDiscoverHookResult {
	skillPaths?: string[];
	promptPaths?: string[];
	themePaths?: string[];
}

/** Runs before switching to another session. */
export interface SessionBeforeSwitchHook {
	type: "session_before_switch";
	reason: "new" | "resume";
	targetSessionFile?: string;
}

export interface SessionBeforeSwitchHookResult {
	cancel?: boolean;
}

/** Runs before context compaction. */
export interface SessionBeforeCompactHook {
	type: "session_before_compact";
	preparation: CompactionPreparation;
	branchEntries: SessionEntry[];
	customInstructions?: string;
	signal: AbortSignal;
}

export interface SessionBeforeCompactHookResult {
	cancel?: boolean;
	compaction?: CompactionResult;
}

export interface TreePreparation {
	targetId: string;
	oldLeafId: string | null;
	commonAncestorId: string | null;
	entriesToSummarize: SessionEntry[];
	userWantsSummary: boolean;
	customInstructions?: string;
	replaceInstructions?: boolean;
	label?: string;
}

/** Runs before navigating in the session tree. */
export interface SessionBeforeTreeHook {
	type: "session_before_tree";
	preparation: TreePreparation;
	signal: AbortSignal;
}

export interface SessionBeforeTreeHookResult {
	cancel?: boolean;
	summary?: {
		summary: string;
		details?: unknown;
	};
	customInstructions?: string;
	replaceInstructions?: boolean;
	label?: string;
}

/** Transforms the Agent context before an LLM call. */
export interface ContextHook {
	type: "context";
	messages: AgentMessage[];
}

export interface ContextHookResult {
	messages?: AgentMessage[];
}

/** Replaces a provider request payload before it is sent. */
export interface BeforeProviderRequestHook {
	type: "before_provider_request";
	payload: unknown;
}

export type BeforeProviderRequestHookResult = unknown;

/** Runs after prompt expansion and before the Agent loop. */
export interface BeforeAgentStartHook {
	type: "before_agent_start";
	prompt: string;
	systemPrompt: string;
	systemPromptOptions: BuildSystemPromptOptions;
}

export interface BeforeAgentStartHookResult {
	message?: Pick<CustomMessage, "customType" | "content" | "display" | "details">;
	systemPrompt?: string;
}

/** Replaces a finalized message while preserving its role. */
export interface MessageEndHook {
	type: "message_end";
	message: AgentMessage;
}

export interface MessageEndHookResult {
	message?: AgentMessage;
}

/** Controls execution of a user-entered shell command. */
export interface UserBashHook {
	type: "user_bash";
	command: string;
	excludeFromContext: boolean;
	cwd: string;
}

export interface UserBashHookResult {
	operations?: BashOperations;
	result?: BashResult;
}

export type InputSource = "interactive" | "rpc" | "extension";

/** Handles or transforms user input before Agent processing. */
export interface InputHook {
	type: "input";
	text: string;
	source: InputSource;
	streamingBehavior?: "steer" | "followUp";
}

export type InputHookResult = { action: "continue" } | { action: "transform"; text: string } | { action: "handled" };

interface ToolCallHookBase {
	type: "tool_call";
	toolCallId: string;
}

export interface BashToolCallHook extends ToolCallHookBase {
	toolName: "bash";
	input: BashToolInput;
}

export interface ReadToolCallHook extends ToolCallHookBase {
	toolName: "read";
	input: ReadToolInput;
}

export interface EditToolCallHook extends ToolCallHookBase {
	toolName: "edit";
	input: EditToolInput;
}

export interface WriteToolCallHook extends ToolCallHookBase {
	toolName: "write";
	input: WriteToolInput;
}

export interface GrepToolCallHook extends ToolCallHookBase {
	toolName: "grep";
	input: GrepToolInput;
}

export interface FindToolCallHook extends ToolCallHookBase {
	toolName: "find";
	input: FindToolInput;
}

export interface GlobToolCallHook extends ToolCallHookBase {
	toolName: "glob";
	input: GlobToolInput;
}

export interface LsToolCallHook extends ToolCallHookBase {
	toolName: "ls";
	input: LsToolInput;
}

export interface CustomToolCallHook extends ToolCallHookBase {
	toolName: string;
	input: Record<string, unknown>;
}

/** Runs before a tool executes and may mutate input or block execution. */
export type ToolCallHook =
	| BashToolCallHook
	| ReadToolCallHook
	| EditToolCallHook
	| WriteToolCallHook
	| GrepToolCallHook
	| FindToolCallHook
	| GlobToolCallHook
	| LsToolCallHook
	| CustomToolCallHook;

export interface ToolCallHookResult {
	block?: boolean;
	reason?: string;
}

interface ToolResultHookBase {
	type: "tool_result";
	toolCallId: string;
	input: Record<string, unknown>;
	content: TextContent[];
	isError: boolean;
}

export interface BashToolResultHook extends ToolResultHookBase {
	toolName: "bash";
	details: BashToolDetails | undefined;
}

export interface ReadToolResultHook extends ToolResultHookBase {
	toolName: "read";
	details: ReadToolDetails | undefined;
}

export interface EditToolResultHook extends ToolResultHookBase {
	toolName: "edit";
	details: EditToolDetails | undefined;
}

export interface WriteToolResultHook extends ToolResultHookBase {
	toolName: "write";
	details: undefined;
}

export interface GrepToolResultHook extends ToolResultHookBase {
	toolName: "grep";
	details: GrepToolDetails | undefined;
}

export interface FindToolResultHook extends ToolResultHookBase {
	toolName: "find";
	details: FindToolDetails | undefined;
}

export interface GlobToolResultHook extends ToolResultHookBase {
	toolName: "glob";
	details: GlobToolDetails | undefined;
}

export interface LsToolResultHook extends ToolResultHookBase {
	toolName: "ls";
	details: LsToolDetails | undefined;
}

export interface CustomToolResultHook extends ToolResultHookBase {
	toolName: string;
	details: unknown;
}

/** Runs after a tool executes and may patch its result. */
export type ToolResultHook =
	| BashToolResultHook
	| ReadToolResultHook
	| EditToolResultHook
	| WriteToolResultHook
	| GrepToolResultHook
	| FindToolResultHook
	| GlobToolResultHook
	| LsToolResultHook
	| CustomToolResultHook;

export interface ToolResultHookResult {
	content?: TextContent[];
	details?: unknown;
	isError?: boolean;
}

export interface ExtensionHookMap {
	resources_discover: { hook: ResourcesDiscoverHook; result: ResourcesDiscoverHookResult };
	session_before_switch: { hook: SessionBeforeSwitchHook; result: SessionBeforeSwitchHookResult };
	session_before_compact: { hook: SessionBeforeCompactHook; result: SessionBeforeCompactHookResult };
	session_before_tree: { hook: SessionBeforeTreeHook; result: SessionBeforeTreeHookResult };
	context: { hook: ContextHook; result: ContextHookResult };
	before_provider_request: { hook: BeforeProviderRequestHook; result: BeforeProviderRequestHookResult };
	before_agent_start: { hook: BeforeAgentStartHook; result: BeforeAgentStartHookResult };
	message_end: { hook: MessageEndHook; result: MessageEndHookResult };
	user_bash: { hook: UserBashHook; result: UserBashHookResult };
	input: { hook: InputHook; result: InputHookResult };
	tool_call: { hook: ToolCallHook; result: ToolCallHookResult };
	tool_result: { hook: ToolResultHook; result: ToolResultHookResult };
}

export type ExtensionHookType = keyof ExtensionHookMap;
export type ExtensionHook = ExtensionHookMap[ExtensionHookType]["hook"];

export function isBashToolResult(hook: ToolResultHook): hook is BashToolResultHook {
	return hook.toolName === "bash";
}

export function isReadToolResult(hook: ToolResultHook): hook is ReadToolResultHook {
	return hook.toolName === "read";
}

export function isEditToolResult(hook: ToolResultHook): hook is EditToolResultHook {
	return hook.toolName === "edit";
}

export function isWriteToolResult(hook: ToolResultHook): hook is WriteToolResultHook {
	return hook.toolName === "write";
}

export function isGrepToolResult(hook: ToolResultHook): hook is GrepToolResultHook {
	return hook.toolName === "grep";
}

export function isFindToolResult(hook: ToolResultHook): hook is FindToolResultHook {
	return hook.toolName === "find";
}

export function isLsToolResult(hook: ToolResultHook): hook is LsToolResultHook {
	return hook.toolName === "ls";
}

export function isToolCallHookType(toolName: "bash", hook: ToolCallHook): hook is BashToolCallHook;
export function isToolCallHookType(toolName: "read", hook: ToolCallHook): hook is ReadToolCallHook;
export function isToolCallHookType(toolName: "edit", hook: ToolCallHook): hook is EditToolCallHook;
export function isToolCallHookType(toolName: "write", hook: ToolCallHook): hook is WriteToolCallHook;
export function isToolCallHookType(toolName: "grep", hook: ToolCallHook): hook is GrepToolCallHook;
export function isToolCallHookType(toolName: "find", hook: ToolCallHook): hook is FindToolCallHook;
export function isToolCallHookType(toolName: "glob", hook: ToolCallHook): hook is GlobToolCallHook;
export function isToolCallHookType(toolName: "ls", hook: ToolCallHook): hook is LsToolCallHook;
export function isToolCallHookType<TName extends string, TInput extends Record<string, unknown>>(
	toolName: TName,
	hook: ToolCallHook,
): hook is ToolCallHook & { toolName: TName; input: TInput };
export function isToolCallHookType(toolName: string, hook: ToolCallHook): boolean {
	return hook.toolName === toolName;
}
