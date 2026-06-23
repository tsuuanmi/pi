import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "../../src/api/types.ts";
import workflowsExtension from "../../src/extensions/workflow-tools.ts";

interface CapturedHandlers {
	sessionStart?: (event: { type: "session_start"; reason: "startup" }, ctx: ExtensionContext) => Promise<void> | void;
}

function createHarness() {
	const handlers: CapturedHandlers = {};
	const statuses = new Map<string, string | undefined>();
	const widgets = new Map<string, string[] | undefined>();
	const api = {
		on(event: string, handler: CapturedHandlers["sessionStart"]): void {
			if (event === "session_start") handlers.sessionStart = handler;
		},
		registerTool(): void {},
	} as unknown as ExtensionAPI;
	workflowsExtension(api);
	const ctx = {
		cwd: process.cwd(),
		mode: "tui",
		hasUI: true,
		ui: {
			setStatus(key: string, text: string | undefined): void {
				statuses.set(key, text);
			},
			setWidget(key: string, lines: string[] | undefined): void {
				widgets.set(key, lines);
			},
		},
		sessionManager: { getSessionId: () => "test-session" },
		getMcpServerInfos: () => [
			{ name: "fs", status: "connected", toolCount: 3, toolNames: ["read", "write", "list"] },
			{ name: "bad", status: "failed", toolCount: 0, toolNames: [], error: "boom" },
		],
	} as unknown as ExtensionContext;
	return { handlers, statuses, widgets, ctx };
}

describe("MCP HUD", () => {
	it("renders MCP server status on session_start", async () => {
		const { handlers, statuses, widgets, ctx } = createHarness();
		await handlers.sessionStart?.({ type: "session_start", reason: "startup" }, ctx);

		expect(statuses.get("mcp")).toBe("MCP 1/2 | 3 tools | 1 failed");
		expect(widgets.get("mcp")).toEqual(["MCP", "fs: connected — 3 tools", "bad: failed — boom"]);
	});

	it("clears MCP HUD when no servers are configured", async () => {
		const { handlers, statuses, widgets, ctx } = createHarness();
		const noMcpCtx = { ...ctx, getMcpServerInfos: () => [] } as unknown as ExtensionContext;
		await handlers.sessionStart?.({ type: "session_start", reason: "startup" }, noMcpCtx);

		expect(statuses.get("mcp")).toBeUndefined();
		expect(widgets.get("mcp")).toBeUndefined();
	});
});
