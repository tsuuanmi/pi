import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi/extensions";
import { refreshHudUi } from "@tsuuanmi/pi-tui";
import type { BrowserInternetAccount } from "#internet/core/types";
import { daemonLoginExists } from "#internet/daemon/config";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import { expandLocalFileReferences } from "#internet/providers/openai/turn/files";
import { adaptInternetRequest, internetProviderName } from "#internet/providers/registry";
import type { InternetSettingsService } from "#internet/settings";

const BRIDGED_TOOLS = new Set(["codex_tool_call", "codex_exec", "codex_apply_patch"]);

export function registerInternetHooks(
	host: Pick<ExtensionAPI, "on" | "onHook">,
	manager: OwnedDaemonManager,
	accounts: BrowserInternetAccount[],
	settings: InternetSettingsService,
): void {
	const providerAccounts = new Map(
		accounts.filter((account) => account.enabled).map((account) => [internetProviderName(account), account.id]),
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
		const providerName = context.model?.provider;
		const accountId = providerName ? providerAccounts.get(providerName) : undefined;
		if (!accountId || !providerName) return hook.payload;
		const account = accounts.find((candidate) => candidate.id === accountId);
		try {
			const loginExists = account ? await daemonLoginExists(account) : false;
			if (!loginExists && !(await settings.get()).autoLogin) {
				if (context.hasUI) {
					context.ui.notify(
						"Automatic browser login is disabled. Run internet_daemon with action login, then retry.",
						"warning",
					);
				}
				return { model: `${providerName}/__request-rejected__`, input: [], stream: true, store: false };
			}
			if (!loginExists && context.hasUI) {
				context.ui.notify(
					"Opening an isolated Chrome profile for browser-provider login. Complete sign-in to continue.",
					"info",
				);
			}
			await manager.ensureReady(accountId);
			const identity = {
				cwd: context.cwd,
				sessionId: context.sessionManager.getSessionId(),
				turnId: latestUserEntryId(context.sessionManager.getBranch()),
			};
			const prepared =
				account?.provider === "openai" ? await expandLocalFileReferences(hook.payload, context.cwd) : hook.payload;
			return adaptInternetRequest(account?.provider ?? "openai", prepared, identity);
		} catch {
			if (context.hasUI)
				context.ui.notify("Internet browser request preparation failed; the request was blocked.", "error");
			return { model: `${providerName}/__request-rejected__`, input: [], stream: true, store: false };
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
