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
import { adaptChatGptWebRequest, rejectedChatGptWebRequest } from "#internet/backends/openai/turn/request";
import type { InternetAccount } from "#internet/core/types";
import { daemonLoginExists } from "#internet/daemon/config";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import type { InternetSettingsService } from "#internet/settings";

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
	settings: InternetSettingsService,
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
		if (!accountId) return event.payload;
		try {
			const account = accounts.find((candidate) => candidate.id === accountId);
			const loginExists = account ? await daemonLoginExists(account) : false;
			if (!loginExists && !(await settings.get()).autoLogin) {
				if (context.hasUI) {
					context.ui.notify(
						"Automatic ChatGPT login is disabled. Run internet_daemon with action login, then retry.",
						"warning",
					);
				}
				return rejectedChatGptWebRequest();
			}
			if (!loginExists && context.hasUI) {
				context.ui.notify(
					"Opening an isolated Chrome profile for ChatGPT login. Complete sign-in to continue.",
					"info",
				);
			}
			await manager.ensureReady(accountId);
			return adaptChatGptWebRequest(event.payload, {
				cwd: context.cwd,
				sessionId: context.sessionManager.getSessionId(),
				turnId: latestUserEntryId(context.sessionManager.getBranch()),
			});
		} catch {
			if (context.hasUI)
				context.ui.notify("ChatGPT Web request preparation failed; the request was blocked.", "error");
			return rejectedChatGptWebRequest();
		}
	});

	host.on("turn_end", async (_event, context) => {
		await refreshHudUi(context);
	});

	host.on("session_shutdown", async () => {
		await manager.stopOwned();
	});
}

function latestUserEntryId(entries: ReturnType<InternetHookContext["sessionManager"]["getBranch"]>): string {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type === "message" && entry.message.role === "user") return entry.id;
	}
	return "";
}

type InternetHookContext = Parameters<ExtensionHandler<BeforeProviderRequestEvent, unknown>>[1];
