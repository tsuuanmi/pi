import type { ExtensionHandler, ToolCallEvent, ToolCallEventResult, TurnEndEvent } from "@tsuuanmi/pi/extensions";
import { registerInternetHooks } from "#internet/hooks";

describe("registerInternetHooks", () => {
	it("blocks bridged tools without an interactive approval surface", async () => {
		let toolCall: ExtensionHandler<ToolCallEvent, ToolCallEventResult> | undefined;
		let turnEnd: ExtensionHandler<TurnEndEvent> | undefined;
		registerInternetHooks({
			on(event: "tool_call" | "turn_end", handler: unknown) {
				if (event === "tool_call") toolCall = handler as ExtensionHandler<ToolCallEvent, ToolCallEventResult>;
				else turnEnd = handler as ExtensionHandler<TurnEndEvent>;
			},
		});
		const result = await toolCall?.({ type: "tool_call", toolCallId: "call", toolName: "codex_exec", input: {} }, {
			hasUI: false,
		} as never);
		expect(result).toMatchObject({ block: true });
		const shutdown = await toolCall?.(
			{ type: "tool_call", toolCallId: "control", toolName: "internet_control", input: { action: "shutdown" } },
			{ hasUI: false } as never,
		);
		expect(shutdown).toMatchObject({ block: true });
		expect(turnEnd).toBeDefined();
	});
});
