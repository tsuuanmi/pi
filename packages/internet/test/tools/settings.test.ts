import type { InternetSettingsStore } from "#internet/settings";
import { registerSettingsTool } from "#internet/tools/settings";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet_settings", () => {
	it("updates auto-login explicitly", async () => {
		const settings = {
			get: vi.fn(async () => ({ autoLogin: true })),
			setAutoLogin: vi.fn(async (autoLogin: boolean) => ({ autoLogin })),
		} as unknown as InternetSettingsStore;
		const tool = captureTools((host) => registerSettingsTool(host, settings)).get("internet_settings");
		const result = await tool?.execute("call", { autoLogin: false }, undefined, undefined, {} as never);
		expect(settings.setAutoLogin).toHaveBeenCalledWith(false);
		expect(result?.details).toEqual({ autoLogin: false });
	});
});
