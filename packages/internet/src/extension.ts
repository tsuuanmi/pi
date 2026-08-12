import type { ExtensionAPI, ExtensionContext, ExtensionToolSpec } from "@tsuuanmi/pi/extensions";
import type { TSchema } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import { readDaemonStatus } from "#internet/backends/openai/daemon/status";
import { registerOpenAiProviders } from "#internet/backends/openai/provider";
import type { InternetContext } from "#internet/core/types";
import { registerInternetHooks } from "#internet/hooks";
import type { InternetToolHost } from "#internet/tool/host";
import type { InternetToolSpec } from "#internet/tool/spec";
import { registerInternetTools } from "#internet/tools/register";

function internetContext(context: ExtensionContext): InternetContext {
	return { cwd: context.cwd };
}

function internetToolHost(host: ExtensionAPI): InternetToolHost {
	return {
		registerTool<TParams extends TSchema, TDetails>(tool: InternetToolSpec<TParams, TDetails>) {
			const extensionTool: ExtensionToolSpec<TParams, TDetails> = {
				...tool,
				execute: (id, params, signal, onUpdate, context) =>
					tool.execute(id, params, signal, onUpdate, internetContext(context)),
			};
			host.registerTool(extensionTool);
		},
	};
}

export default async function internetExtension(host: ExtensionAPI): Promise<void> {
	const accounts = await new AccountRegistry().list();
	registerOpenAiProviders(host, accounts);
	registerInternetTools(internetToolHost(host));
	registerInternetHooks(host);
	host.registerHudProvider(readDaemonStatus);
}
