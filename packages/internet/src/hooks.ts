import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi/extensions";
import { refreshHudUi } from "@tsuuanmi/pi-tui";
import { providerName } from "#internet/backends/openai/provider";
import { expandLocalFileReferences } from "#internet/backends/openai/turn/files";
import { adaptChatGptWebRequest, rejectedChatGptWebRequest } from "#internet/backends/openai/turn/request";
import type { OpenAiInternetAccount } from "#internet/core/types";
import { daemonLoginExists } from "#internet/daemon/config";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import type { InternetSettingsService } from "#internet/settings";

const BRIDGED_TOOLS = new Set(["codex_tool_call", "codex_exec", "codex_apply_patch"]);

export function registerInternetHooks(
	host: Pick<ExtensionAPI, "on" | "onHook">,
	manager: OwnedDaemonManager,
	accounts: OpenAiInternetAccount[],
	settings: InternetSettingsService,
): void {
	const providerAccounts = new Map(
		accounts.filter((account) => account.enabled).map((account) => [providerName(account), account.id]),
	);

	host.onHook("tool_call", async (hook, context) => {
		const lifecycleAction =
			hook.toolName === "internet_control" ||
			hook.toolName === "internet_daemon" ||
			hook.toolName === "internet_harness"
				? hook.input.action
				: undefined;
		const requiresApproval =
			BRIDGED_TOOLS.has(hook.toolName) ||
			hook.toolName === "internet_control" ||
			hook.toolName === "internet_daemon" ||
			hook.toolName === "internet_harness";
		if (!requiresApproval) return undefined;
		if (!context.hasUI) {
			return { block: true, reason: "This internet tool requires interactive approval." };
		}
		const approved = await context.ui.confirm(
			"Approve internet tool",
			`Allow ${hook.toolName}${typeof lifecycleAction === "string" ? ` (${lifecycleAction})` : ""} for this call?`,
		);
		return approved ? undefined : { block: true, reason: "Internet tool call was not approved." };
	});

	host.onHook("before_provider_request", async (hook, context) => {
		const accountId = context.model ? providerAccounts.get(context.model.provider) : undefined;
		if (!accountId) return hook.payload;
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
			const payload = await expandLocalFileReferences(hook.payload, context.cwd);
			return adaptChatGptWebRequest(payload, {
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
}

function latestUserEntryId(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>): string {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type === "message" && entry.message.role === "user") return entry.id;
	}
	return "";
}
