import type {
	BeforeProviderRequestEvent,
	ExtensionHandler,
	SessionShutdownEvent,
	ToolCallEvent,
	ToolCallEventResult,
	TurnEndEvent,
} from "@tsuuanmi/pi/extensions";
import type { InternetAccount } from "#internet/core/types";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import { registerInternetHooks } from "#internet/hooks";

const account: InternetAccount = {
	id: "default",
	backend: "openai",
	displayName: "ChatGPT Web",
	configDir: "/tmp/default",
	host: "127.0.0.1",
	port: 17841,
	enabled: true,
};

describe("registerInternetHooks", () => {
	it("blocks bridged tools and stops the daemon on shutdown", async () => {
		let toolCall: ExtensionHandler<ToolCallEvent, ToolCallEventResult> | undefined;
		let turnEnd: ExtensionHandler<TurnEndEvent> | undefined;
		let sessionShutdown: ExtensionHandler<SessionShutdownEvent> | undefined;
		const stopOwned = vi.fn(async () => {});
		registerInternetHooks(
			{
				on(event: "tool_call" | "turn_end" | "before_provider_request" | "session_shutdown", handler: unknown) {
					if (event === "tool_call") toolCall = handler as ExtensionHandler<ToolCallEvent, ToolCallEventResult>;
					else if (event === "turn_end") turnEnd = handler as ExtensionHandler<TurnEndEvent>;
					else if (event === "session_shutdown")
						sessionShutdown = handler as ExtensionHandler<SessionShutdownEvent>;
				},
			},
			{ stopOwned } as unknown as OwnedDaemonManager,
			[account],
		);
		const result = await toolCall?.({ type: "tool_call", toolCallId: "call", toolName: "codex_exec", input: {} }, {
			hasUI: false,
		} as never);
		expect(result).toMatchObject({ block: true });
		expect(turnEnd).toBeDefined();
		await sessionShutdown?.({ type: "session_shutdown", reason: "quit" }, {} as never);
		expect(stopOwned).toHaveBeenCalledOnce();
	});

	it("readiness-gates only registered internet providers", async () => {
		let beforeRequest: ExtensionHandler<BeforeProviderRequestEvent, unknown> | undefined;
		const ensureReady = vi.fn(async () => {});
		registerInternetHooks(
			{
				on(event: "tool_call" | "turn_end" | "before_provider_request" | "session_shutdown", handler: unknown) {
					if (event === "before_provider_request") {
						beforeRequest = handler as ExtensionHandler<BeforeProviderRequestEvent, unknown>;
					}
				},
			},
			{ ensureReady } as unknown as OwnedDaemonManager,
			[account],
		);
		const payload = { input: "test" };
		await expect(
			beforeRequest?.({ type: "before_provider_request", payload }, { model: { provider: "chatgpt-web" } } as never),
		).resolves.toBe(payload);
		expect(ensureReady).toHaveBeenCalledWith("default");
		await beforeRequest?.({ type: "before_provider_request", payload }, {
			model: { provider: "anthropic" },
		} as never);
		expect(ensureReady).toHaveBeenCalledOnce();
	});
});
