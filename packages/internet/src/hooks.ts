import type {
	ExtensionContext,
	ExtensionHandler,
	ToolCallEvent,
	ToolCallEventResult,
	TurnEndEvent,
} from "@tsuuanmi/pi/extensions";
import { refreshHudUi } from "@tsuuanmi/pi-tui";

const BRIDGED_TOOLS = new Set(["codex_tool_call", "codex_exec", "codex_apply_patch"]);

export interface InternetHookHost {
	on(event: "tool_call", handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>): void;
	on(event: "turn_end", handler: ExtensionHandler<TurnEndEvent>): void;
}

export function registerInternetHooks(host: InternetHookHost): void {
	host.on("tool_call", async (event, context) => {
		const controlAction = event.toolName === "internet_control" ? event.input.action : undefined;
		const requiresApproval = BRIDGED_TOOLS.has(event.toolName) || event.toolName === "internet_control";
		if (!requiresApproval) return undefined;
		if (!context.hasUI) {
			return { block: true, reason: "This internet tool requires interactive approval." };
		}
		const approved = await context.ui.confirm(
			"Approve internet tool",
			`Allow ${event.toolName}${typeof controlAction === "string" ? ` (${controlAction})` : ""} for this call?`,
		);
		return approved ? undefined : { block: true, reason: "Internet tool call was not approved." };
	});

	host.on("turn_end", async (_event, context) => {
		await refreshHudUi(context);
	});
}

export type InternetHookContext = ExtensionContext;
