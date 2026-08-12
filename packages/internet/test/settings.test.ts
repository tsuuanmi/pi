import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InternetSettingsStore } from "#internet/settings";

describe("InternetSettingsStore", () => {
	it("defaults autoLogin to true and persists private settings", async () => {
		const directory = await mkdtemp(join(tmpdir(), "pi-internet-settings-"));
		const path = join(directory, "settings.json");
		const store = new InternetSettingsStore({ path });
		await expect(store.get()).resolves.toEqual({ autoLogin: true });
		await expect(store.setAutoLogin(false)).resolves.toEqual({ autoLogin: false });
		await expect(store.get()).resolves.toEqual({ autoLogin: false });
		expect((await stat(path)).mode & 0o777).toBe(0o600);
	});
});
