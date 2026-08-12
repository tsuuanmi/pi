import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import { readDaemonStatusSnapshot } from "#internet/backends/openai/daemon/status";

describe("readDaemonStatusSnapshot", () => {
	it("returns an unavailable snapshot instead of throwing", async () => {
		vi.spyOn(AccountRegistry.prototype, "get").mockRejectedValue(new Error("missing"));
		await expect(readDaemonStatusSnapshot()).resolves.toMatchObject({ available: false, error: "missing" });
	});

	it("uses the registry account rather than external daemon environment", async () => {
		vi.spyOn(AccountRegistry.prototype, "get").mockResolvedValue({ id: "default" } as never);
		vi.spyOn(DaemonClient, "forAccount").mockResolvedValue({
			baseUrl: () => "http://127.0.0.1:17841/v1",
			health: async () => ({ status: "ok", accepting_turns: true, active_http_turns: 0, active_browser_turns: 0 }),
		} as DaemonClient);
		await expect(readDaemonStatusSnapshot()).resolves.toMatchObject({ available: true });
	});
});
