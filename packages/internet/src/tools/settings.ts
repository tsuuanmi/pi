import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import { type InternetSettingsService, InternetSettingsStore } from "#internet/settings";

export function registerSettingsTool(
	host: Pick<ExtensionAPI, "registerTool">,
	settings: InternetSettingsService = new InternetSettingsStore(),
): void {
	host.registerTool({
		name: "internet_settings",
		label: "Internet Settings",
		description: "Inspect or update ChatGPT Web package settings.",
		parameters: Type.Object({ autoLogin: Type.Optional(Type.Boolean()) }),
		async execute(_id, params) {
			const result =
				params.autoLogin === undefined ? await settings.get() : await settings.setAutoLogin(params.autoLogin);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
		},
	});
}
