/**
 * Extension contract — the minimal host surface that extension packages
 * program against.
 *
 * This lives in @tsuuanmi/pi-agent (the lower layer) so that higher-level
 * packages can depend only on agent-core and not on @tsuuanmi/pi. @tsuuanmi/pi's full
 * `ExtensionAPI`/`ExtensionContext`/`ToolDefinition`/`SubagentManager` types
 * structurally satisfy these contracts (superset of members, method-shorthand
 * bivariance), so the host can pass its real objects where these minimal
 * contracts are expected.
 */

import type { Static, TSchema } from "typebox";
import type { AgentToolResult, AgentToolUpdateCallback, ToolExecutionMode } from "#agent/agent/types";
import type { SubagentManager } from "#agent/subagents/subagent-manager";

// ============================================================================
// Tool contract
// ============================================================================

/**
 * Minimal tool definition. The pi host adds optional render hooks
 * (`renderCall`/`renderResult`) and a render context on top of this; those are
 * omitted here so the contract does not pull in TUI/Theme types.
 */
export interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown, _TState = any> {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: TParams;
	renderShell?: "default" | "self";
	prepareArguments?: (args: unknown) => Static<TParams>;
	executionMode?: ToolExecutionMode;
	execute(
		toolCallId: string,
		params: Static<TParams>,
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
		ctx: ExtensionContext,
	): Promise<AgentToolResult<TDetails>>;
}

/** Tool metadata returned by {@link ExtensionAPI.getAllTools}. */
export type ToolInfo = Pick<ToolDefinition, "name" | "description" | "parameters" | "promptGuidelines"> & {
	sourceInfo: unknown;
};

// ============================================================================
// UI / context contract
// ============================================================================

export type ExtensionMode = "tui" | "rpc" | "json" | "print";

export interface ExtensionWidgetOptions {
	placement?: string;
}

/** Minimal UI context used by extension HUD/status updates. */
export interface ExtensionUIContext {
	setStatus(key: string, text: string | undefined): void;
	setWidget(key: string, content: string[] | undefined, options?: ExtensionWidgetOptions): void;
}

/** Minimal read-only session manager surface used by extensions. */
export interface ReadonlySessionManager {
	getSessionId(): string;
}

/**
 * Context passed to extension event handlers and tool executors. The
 * pi host provides a superset of these members.
 */
export interface ExtensionContext {
	ui: ExtensionUIContext;
	mode: ExtensionMode;
	cwd: string;
	sessionManager: ReadonlySessionManager;
	subagents?: SubagentManager;
	skipAutomaticContinuation: boolean;
	getSystemPrompt(): string;
}

// ============================================================================
// Event contract
// ============================================================================

/** Handler function type for events. */
// biome-ignore lint/suspicious/noConfusingVoidType: void allows bare return statements
export type ExtensionHandler<E, R = undefined> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;

interface SessionStartEvent {
	type: "session_start";
	reason: "startup" | "reload" | "new" | "resume" | "fork";
	previousSessionFile?: string;
}

interface TurnEndEvent {
	type: "turn_end";
}

interface ToolExecutionEndEvent {
	type: "tool_execution_end";
}

interface BeforeAgentStartEvent {
	type: "before_agent_start";
	prompt: string;
	systemPrompt: string;
}

interface BeforeAgentStartEventResult {
	systemPrompt?: string;
}

interface ToolCallEvent {
	type: "tool_call";
	toolCallId: string;
	toolName: string;
	input: unknown;
}

interface ToolCallEventResult {
	block?: boolean;
	reason?: string;
}

// ============================================================================
// Extension API contract
// ============================================================================

/**
 * Minimal host extension API used by extension packages. The pi
 * host exposes a superset of these members.
 */
export interface ExtensionAPI {
	on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
	on(event: "turn_end", handler: ExtensionHandler<TurnEndEvent>): void;
	on(event: "tool_execution_end", handler: ExtensionHandler<ToolExecutionEndEvent>): void;
	on(event: "before_agent_start", handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>): void;
	on(event: "tool_call", handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>): void;
	registerTool<TParams extends TSchema = TSchema, TDetails = unknown, _TState = any>(
		tool: ToolDefinition<TParams, TDetails, _TState>,
	): void;
	registerFlag?(
		name: string,
		options: {
			description?: string;
			type: "boolean" | "string";
			default?: boolean | string;
		},
	): void;
	getFlag(name: string): boolean | string | undefined;
	getActiveTools(): string[];
	getAllTools(): ToolInfo[];
	setActiveTools(toolNames: string[]): void;
}
