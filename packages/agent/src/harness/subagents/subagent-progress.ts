/**
 * Subagent progress snapshots — retained diagnostic state for running subagents.
 *
 * When a subagent times out or fails, the parent only sees `status: failed`
 * with no detail about what the subagent was doing. This module retains
 * deep-cloned progress snapshots so parents can inspect last-known state.
 *
 * Aligned with gajae-code's `AgentProgress` / `recordSubagentProgress` pattern
 * but Pi-native: subscribes to Pi's `AgentEvent` stream rather than gajae's
 * executor callbacks.
 */
import type { AgentMessage } from "../../types.ts";
import type { AssistantMessage } from "@tsuuanmi/pi-ai";

/** Minimal event shape the tracker can consume (superset of AgentEvent). */
interface TrackableEvent {
	type: string;
	toolName?: string;
	toolCallId?: string;
	args?: unknown;
	result?: unknown;
	isError?: boolean;
	message?: AgentMessage;
}

export interface SubagentProgress {
	id: string;
	status: "running" | "paused" | "completed" | "failed" | "cancelled";
	/** Current tool being executed, if any. */
	currentTool?: string;
	/** Truncated args string for the current tool call. */
	currentToolArgs?: string;
	/** Timestamp (ms) when the current tool started. */
	currentToolStartMs?: number;
	/** Recent tool calls (name + truncated args + end time), most recent first. */
	recentTools: Array<{ tool: string; args: string; endMs: number }>;
	/** Recent assistant output lines (last N non-empty text blocks). */
	recentOutput: string[];
	/** Total tool calls executed. */
	toolCount: number;
	/** Total turns completed. */
	turnCount: number;
	/** ISO timestamp when the snapshot was last updated. */
	updated_at: string;
	/** Elapsed time in ms since the subagent started. */
	durationMs: number;
}

const MAX_RECENT_TOOLS = 10;
const MAX_RECENT_OUTPUT_LINES = 8;
const MAX_TOOL_ARGS_LEN = 200;
const MAX_OUTPUT_LINE_LEN = 500;

function truncate(value: string, limit: number): string {
	return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function truncateArgs(args: unknown): string {
	try {
		const str = typeof args === "string" ? args : JSON.stringify(args);
		return truncate(str ?? "", MAX_TOOL_ARGS_LEN);
	} catch {
		return "[unserializable args]";
	}
}

function textFromAssistant(message: AgentMessage): string {
	if (message.role !== "assistant") return "";
	const assistant = message as AssistantMessage;
	return assistant.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

/**
 * Tracker that retains the latest progress snapshot for each running subagent.
 * Snapshots are deep-cloned on store so later mutation cannot corrupt retained
 * state. Cleared when a subagent reaches a terminal status.
 */
export class SubagentProgressTracker {
	private readonly snapshots = new Map<string, SubagentProgress>();
	private readonly startTimes = new Map<string, number>();
	private readonly unsubscribers = new Map<string, () => void>();
	/** Current tool args by subagent id, captured at tool_execution_start. */
	private readonly currentToolArgs = new Map<string, string>();

	/** Begin tracking a subagent. Call when the subagent starts running. */
	startTracking(id: string, subscribe: (handler: (event: TrackableEvent) => void) => () => void): void {
		const startMs = Date.now();
		this.startTimes.set(id, startMs);
		const initial: SubagentProgress = {
			id,
			status: "running",
			recentTools: [],
			recentOutput: [],
			toolCount: 0,
			turnCount: 0,
			updated_at: new Date().toISOString(),
			durationMs: 0,
		};
		this.snapshots.set(id, structuredClone(initial));

		const unsubscribe = subscribe((event) => {
			this.handleEvent(id, event);
		});
		this.unsubscribers.set(id, unsubscribe);
	}

	private handleEvent(id: string, event: TrackableEvent): void {
		const snapshot = this.snapshots.get(id);
		if (!snapshot) return;
		const startMs = this.startTimes.get(id);
		const now = Date.now();

		switch (event.type) {
			case "tool_execution_start": {
				snapshot.currentTool = event.toolName;
				const argsStr = truncateArgs(event.args);
				snapshot.currentToolArgs = argsStr;
				this.currentToolArgs.set(id, argsStr);
				snapshot.currentToolStartMs = now;
				snapshot.toolCount++;
				break;
			}
			case "tool_execution_end": {
				const args = this.currentToolArgs.get(id) ?? "";
				snapshot.recentTools.unshift({
					tool: event.toolName ?? "unknown",
					args,
					endMs: now,
				});
				if (snapshot.recentTools.length > MAX_RECENT_TOOLS) {
					snapshot.recentTools.length = MAX_RECENT_TOOLS;
				}
				snapshot.currentTool = undefined;
				snapshot.currentToolArgs = undefined;
				snapshot.currentToolStartMs = undefined;
				this.currentToolArgs.delete(id);
				break;
			}
			case "turn_end": {
				snapshot.turnCount++;
				const text = event.message ? textFromAssistant(event.message) : "";
				if (text) {
					const lines = text.split("\n").filter((l) => l.trim());
					snapshot.recentOutput = [...lines.slice(-MAX_RECENT_OUTPUT_LINES), ...snapshot.recentOutput].slice(
						0,
						MAX_RECENT_OUTPUT_LINES,
					);
				}
				break;
			}
			case "message_end": {
				if (event.message && event.message.role === "assistant") {
					const text = textFromAssistant(event.message);
					if (text) {
						const lines = text
							.split("\n")
							.filter((l) => l.trim())
							.map((l) => truncate(l, MAX_OUTPUT_LINE_LEN));
						snapshot.recentOutput = [...lines.slice(-MAX_RECENT_OUTPUT_LINES), ...snapshot.recentOutput].slice(
							0,
							MAX_RECENT_OUTPUT_LINES,
						);
					}
				}
				break;
			}
			default:
				return;
		}

		snapshot.updated_at = new Date().toISOString();
		snapshot.durationMs = startMs ? now - startMs : 0;
		// Deep-clone to insulate retained state from live mutation
		this.snapshots.set(id, structuredClone(snapshot));
	}

	/** Mark a subagent as reaching a terminal status. Stops tracking. */
	markTerminal(id: string, status: "completed" | "failed" | "cancelled" | "paused"): void {
		const snapshot = this.snapshots.get(id);
		if (snapshot) {
			snapshot.status = status;
			snapshot.currentTool = undefined;
			snapshot.currentToolArgs = undefined;
			snapshot.currentToolStartMs = undefined;
			snapshot.updated_at = new Date().toISOString();
			this.snapshots.set(id, structuredClone(snapshot));
		}
		this.stopTracking(id);
	}

	/** Stop tracking a subagent (unsubscribe from events). Retained snapshot stays. */
	stopTracking(id: string): void {
		const unsubscribe = this.unsubscribers.get(id);
		if (unsubscribe) {
			unsubscribe();
			this.unsubscribers.delete(id);
		}
	}

	/** Get the retained progress snapshot for a subagent. */
	getProgress(id: string): SubagentProgress | undefined {
		return this.snapshots.get(id);
	}

	/** Clear all retained state for a subagent. */
	clear(id: string): void {
		this.stopTracking(id);
		this.snapshots.delete(id);
		this.startTimes.delete(id);
		this.currentToolArgs.delete(id);
	}

	/** Clear all retained state. */
	clearAll(): void {
		for (const unsubscribe of this.unsubscribers.values()) unsubscribe();
		this.unsubscribers.clear();
		this.snapshots.clear();
		this.startTimes.clear();
		this.currentToolArgs.clear();
	}
}

/**
 * Render a progress snapshot as a human-readable diagnostic string for display
 * when a subagent times out or fails. Includes current tool, recent tools,
 * and recent output to help diagnose why the subagent got stuck.
 */
export function renderSubagentProgress(progress: SubagentProgress): string {
	const lines: string[] = [
		`Subagent ${progress.id} — status: ${progress.status}`,
		`Turns: ${progress.turnCount} | Tools: ${progress.toolCount} | Duration: ${(progress.durationMs / 1000).toFixed(1)}s`,
	];

	if (progress.currentTool) {
		const elapsed = progress.currentToolStartMs
			? ` (${((Date.now() - progress.currentToolStartMs) / 1000).toFixed(1)}s)`
			: "";
		lines.push(`Current tool: ${progress.currentTool}${elapsed}`);
		if (progress.currentToolArgs) {
			lines.push(`  args: ${progress.currentToolArgs}`);
		}
	}

	if (progress.recentTools.length > 0) {
		lines.push("Recent tools:");
		for (const tool of progress.recentTools.slice(0, 5)) {
			const age = ((Date.now() - tool.endMs) / 1000).toFixed(1);
			lines.push(`  ${tool.tool} (${age}s ago): ${tool.args}`);
		}
	}

	if (progress.recentOutput.length > 0) {
		lines.push("Recent output:");
		for (const line of progress.recentOutput.slice(0, 4)) {
			lines.push(`  ${line}`);
		}
	}

	return lines.join("\n");
}
