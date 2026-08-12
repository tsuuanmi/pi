import type {
	BeforeProviderRequestEvent,
	ExtensionHandler,
	SessionShutdownEvent,
	ToolCallEvent,
	ToolCallEventResult,
	TurnEndEvent,
} from "@tsuuanmi/pi/extensions";
import { refreshHudUi } from "@tsuuanmi/pi-tui";
import { providerName } from "#internet/backends/openai/provider";
import type { InternetAccount } from "#internet/core/types";
import { daemonLoginExists } from "#internet/daemon/config";
import type { OwnedDaemonManager } from "#internet/daemon/manager";

const BRIDGED_TOOLS = new Set(["codex_tool_call", "codex_exec", "codex_apply_patch"]);

export interface InternetHookHost {
	on(event: "tool_call", handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>): void;
	on(event: "turn_end", handler: ExtensionHandler<TurnEndEvent>): void;
	on(event: "before_provider_request", handler: ExtensionHandler<BeforeProviderRequestEvent, unknown>): void;
	on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): void;
}

export function registerInternetHooks(
	host: InternetHookHost,
	manager: OwnedDaemonManager,
	accounts: InternetAccount[],
): void {
	const providerAccounts = new Map(
		accounts.filter((account) => account.enabled).map((account) => [providerName(account), account.id]),
	);

	host.on("tool_call", async (event, context) => {
		const lifecycleAction =
			event.toolName === "internet_control" || event.toolName === "internet_daemon" ? event.input.action : undefined;
		const requiresApproval =
			BRIDGED_TOOLS.has(event.toolName) ||
			event.toolName === "internet_control" ||
			event.toolName === "internet_daemon";
		if (!requiresApproval) return undefined;
		if (!context.hasUI) {
			return { block: true, reason: "This internet tool requires interactive approval." };
		}
		const approved = await context.ui.confirm(
			"Approve internet tool",
			`Allow ${event.toolName}${typeof lifecycleAction === "string" ? ` (${lifecycleAction})` : ""} for this call?`,
		);
		return approved ? undefined : { block: true, reason: "Internet tool call was not approved." };
	});

	host.on("before_provider_request", async (event, context) => {
		const accountId = context.model ? providerAccounts.get(context.model.provider) : undefined;
		if (accountId) {
			const account = accounts.find((candidate) => candidate.id === accountId);
			if (account && !(await daemonLoginExists(account)) && context.hasUI) {
				context.ui.notify(
					"Opening an isolated Chrome profile for ChatGPT login. Complete sign-in to continue.",
					"info",
				);
			}
			await manager.ensureReady(accountId);
		}
		return event.payload;
	});

	host.on("turn_end", async (_event, context) => {
		await refreshHudUi(context);
	});

	host.on("session_shutdown", async () => {
		await manager.stopOwned();
	});
}
