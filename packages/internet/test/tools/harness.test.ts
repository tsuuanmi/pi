import { AccountRegistry } from "#internet/accounts/registry";
import * as harness from "#internet/daemon/harness";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import { registerHarnessTool } from "#internet/tools/harness";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet_harness", () => {
	it("enables Full mode and restarts the account daemon", async () => {
		vi.spyOn(AccountRegistry.prototype, "get").mockResolvedValue({ id: "default" } as never);
		const enable = vi.spyOn(harness, "enableFullHarness").mockResolvedValue({
			mode: "full",
			tunnelClientPath: "/usr/bin/tunnel-client",
			tunnelId: `tunnel_${"a".repeat(32)}`,
			runtimeKeyFile: "/private/key",
		});
		vi.spyOn(harness, "readHarnessConfig").mockResolvedValue({
			mode: "full",
			tunnelClientPath: "/usr/bin/tunnel-client",
			tunnelId: `tunnel_${"a".repeat(32)}`,
			runtimeKeyFile: "/private/key",
		});
		const manager = { restart: vi.fn(async () => {}) } as unknown as OwnedDaemonManager;
		const tool = captureTools((host) => registerHarnessTool(host, manager)).get("internet_harness");
		const result = await tool?.execute(
			"call",
			{
				action: "enable",
				tunnelClientPath: "/usr/bin/tunnel-client",
				tunnelId: `tunnel_${"a".repeat(32)}`,
				runtimeKeyFile: "/source/key",
			},
			undefined,
			undefined,
			{} as never,
		);
		expect(enable).toHaveBeenCalled();
		expect(manager.restart).toHaveBeenCalledWith("default");
		expect(result?.details).toMatchObject({ mode: "full", connectorSetupRequired: true });
	});
});
