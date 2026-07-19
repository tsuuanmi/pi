import type { AgentMessage } from "@tsuuanmi/pi-agent";
import {
	extractYieldFromMessages,
	renderSubagentProgress,
	SubagentProgressTracker,
	type YieldDetails,
} from "@tsuuanmi/pi-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("SubagentProgressTracker", () => {
	let tracker: SubagentProgressTracker;
	let emittedEvents: Array<(event: { type: string } & Record<string, unknown>) => void> = [];

	beforeEach(() => {
		tracker = new SubagentProgressTracker();
		emittedEvents = [];
	});

	afterEach(() => {
		tracker.clearAll();
	});

	function createSubscribe() {
		return (handler: (event: { type: string } & Record<string, unknown>) => void): (() => void) => {
			emittedEvents.push(handler);
			return () => {
				emittedEvents = emittedEvents.filter((h) => h !== handler);
			};
		};
	}

	function emit(event: { type: string } & Record<string, unknown>): void {
		for (const handler of emittedEvents) handler(event);
	}

	it("creates an initial running snapshot on startTracking", () => {
		tracker.startTracking("sub-1", createSubscribe());
		const progress = tracker.getProgress("sub-1");
		expect(progress).toBeDefined();
		expect(progress?.status).toBe("running");
		expect(progress?.toolCount).toBe(0);
		expect(progress?.turnCount).toBe(0);
	});

	it("tracks tool execution start and end", () => {
		tracker.startTracking("sub-1", createSubscribe());
		emit({ type: "tool_execution_start", toolName: "read", toolCallId: "tc-1", args: { path: "/foo" } });
		let progress = tracker.getProgress("sub-1");
		expect(progress?.currentTool).toBe("read");
		expect(progress?.toolCount).toBe(1);

		emit({ type: "tool_execution_end", toolName: "read", toolCallId: "tc-1", result: "ok", isError: false });
		progress = tracker.getProgress("sub-1");
		expect(progress?.currentTool).toBeUndefined();
		expect(progress?.recentTools).toHaveLength(1);
		expect(progress?.recentTools[0]?.tool).toBe("read");
	});

	it("counts turns on turn_end", () => {
		tracker.startTracking("sub-1", createSubscribe());
		emit({
			type: "turn_end",
			message: { role: "assistant", content: [{ type: "text", text: "done" }] } as AgentMessage,
			toolResults: [],
		});
		const progress = tracker.getProgress("sub-1");
		expect(progress?.turnCount).toBe(1);
		expect(progress?.recentOutput).toContain("done");
	});

	it("marks terminal status and stops tracking", () => {
		tracker.startTracking("sub-1", createSubscribe());
		emit({ type: "tool_execution_start", toolName: "read", toolCallId: "tc-1", args: {} });
		tracker.markTerminal("sub-1", "completed");

		const progress = tracker.getProgress("sub-1");
		expect(progress?.status).toBe("completed");
		expect(progress?.currentTool).toBeUndefined();

		// Events after terminal should not update the snapshot
		emit({ type: "tool_execution_start", toolName: "write", toolCallId: "tc-2", args: {} });
		expect(tracker.getProgress("sub-1")?.currentTool).toBeUndefined();
	});

	it("clears all state for a subagent", () => {
		tracker.startTracking("sub-1", createSubscribe());
		expect(tracker.getProgress("sub-1")).toBeDefined();
		tracker.clear("sub-1");
		expect(tracker.getProgress("sub-1")).toBeUndefined();
	});

	it("returns undefined for unknown subagent", () => {
		expect(tracker.getProgress("unknown")).toBeUndefined();
	});

	it("limits recent tools to 10", () => {
		tracker.startTracking("sub-1", createSubscribe());
		for (let i = 0; i < 15; i++) {
			emit({ type: "tool_execution_start", toolName: `tool-${i}`, toolCallId: `tc-${i}`, args: {} });
			emit({
				type: "tool_execution_end",
				toolName: `tool-${i}`,
				toolCallId: `tc-${i}`,
				result: "ok",
				isError: false,
			});
		}
		const progress = tracker.getProgress("sub-1");
		expect(progress?.recentTools).toHaveLength(10);
		// Most recent should be first
		expect(progress?.recentTools[0]?.tool).toBe("tool-14");
	});

	it("truncates long tool args", () => {
		tracker.startTracking("sub-1", createSubscribe());
		const longArgs = { data: "x".repeat(500) };
		emit({ type: "tool_execution_start", toolName: "write", toolCallId: "tc-1", args: longArgs });
		const progress = tracker.getProgress("sub-1");
		expect(progress?.currentToolArgs?.length).toBeLessThan(250);
		expect(progress?.currentToolArgs?.endsWith("…")).toBe(true);
	});
});

describe("renderSubagentProgress", () => {
	it("renders a diagnostic summary with status and counts", () => {
		const tracker = new SubagentProgressTracker();
		tracker.startTracking("sub-1", () => () => {});
		// Simulate some activity
		tracker.markTerminal("sub-1", "failed");
		const progress = tracker.getProgress("sub-1")!;
		const rendered = renderSubagentProgress(progress);
		expect(rendered).toContain("sub-1");
		expect(rendered).toContain("failed");
		expect(rendered).toContain("Turns:");
		expect(rendered).toContain("Tools:");
	});

	it("includes current tool when active", () => {
		const tracker = new SubagentProgressTracker();
		const handlers: Array<(e: { type: string } & Record<string, unknown>) => void> = [];
		tracker.startTracking("sub-1", (h) => {
			handlers.push(h);
			return () => {};
		});
		for (const h of handlers)
			h({ type: "tool_execution_start", toolName: "bash", toolCallId: "tc-1", args: { cmd: "ls" } });
		const progress = tracker.getProgress("sub-1")!;
		const rendered = renderSubagentProgress(progress);
		expect(rendered).toContain("Current tool: bash");
		tracker.clearAll();
	});

	it("includes recent tools list", () => {
		const tracker = new SubagentProgressTracker();
		const handlers: Array<(e: { type: string } & Record<string, unknown>) => void> = [];
		tracker.startTracking("sub-1", (h) => {
			handlers.push(h);
			return () => {};
		});
		for (const h of handlers)
			h({ type: "tool_execution_start", toolName: "read", toolCallId: "tc-1", args: { path: "/a" } });
		for (const h of handlers)
			h({ type: "tool_execution_end", toolName: "read", toolCallId: "tc-1", result: "ok", isError: false });
		const progress = tracker.getProgress("sub-1")!;
		const rendered = renderSubagentProgress(progress);
		expect(rendered).toContain("Recent tools:");
		expect(rendered).toContain("read");
		tracker.clearAll();
	});
});

describe("extractYieldFromMessages", () => {
	function makeToolResult(toolName: string, details: unknown): AgentMessage {
		return {
			role: "toolResult",
			toolCallId: "tc-1",
			toolName,
			content: [{ type: "text", text: "ok" }],
			details,
			isError: false,
			timestamp: Date.now(),
		} as unknown as AgentMessage;
	}

	it("extracts yield details from messages", () => {
		const messages: AgentMessage[] = [
			makeToolResult("yield", { data: { result: 42 }, status: "success" } as YieldDetails),
		];
		const result = extractYieldFromMessages(messages);
		expect(result?.status).toBe("success");
		expect(result?.data).toEqual({ result: 42 });
	});

	it("returns undefined when no yield tool result exists", () => {
		const messages: AgentMessage[] = [makeToolResult("read", undefined)];
		expect(extractYieldFromMessages(messages)).toBeUndefined();
	});

	it("returns the most recent yield result", () => {
		const messages: AgentMessage[] = [
			makeToolResult("yield", { data: "first", status: "success" } as YieldDetails),
			makeToolResult("yield", { data: "second", status: "success" } as YieldDetails),
		];
		const result = extractYieldFromMessages(messages);
		expect(result?.data).toBe("second");
	});

	it("extracts error yields", () => {
		const messages: AgentMessage[] = [
			makeToolResult("yield", { data: undefined, status: "aborted", error: "something went wrong" } as YieldDetails),
		];
		const result = extractYieldFromMessages(messages);
		expect(result?.status).toBe("aborted");
		expect(result?.error).toBe("something went wrong");
	});

	it("returns undefined for empty messages", () => {
		expect(extractYieldFromMessages([])).toBeUndefined();
	});
});
