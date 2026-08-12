import { AccountRegistry } from "#internet/accounts/registry";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import { registerDaemonTool } from "#internet/tools/daemon";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet_daemon", () => {
	it("maps lifecycle actions to the package-owned manager", async () => {
		vi.spyOn(AccountRegistry.prototype, "get").mockResolvedValue({ id: "default" } as never);
		const manager = {
			restart: vi.fn(async () => {}),
			status: vi.fn(async () => [{ account: "default", state: "running", loginExists: true }]),
		} as unknown as OwnedDaemonManager;
		const tool = captureTools((host) => registerDaemonTool(host, manager)).get("internet_daemon");
		const result = await tool?.execute("call", { action: "restart" }, undefined, undefined, {} as never);
		expect(manager.restart).toHaveBeenCalledWith("default");
		expect(result?.details).toMatchObject({ state: "running" });
	});
});
