import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import { registerControlTools } from "#internet/tools/control";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet_control", () => {
	it("maps the action to the daemon client", async () => {
		const control = vi.fn(async () => ({ status: "ok" }));
		vi.spyOn(AccountRegistry.prototype, "get").mockResolvedValue({ id: "default" } as never);
		vi.spyOn(DaemonClient, "forAccount").mockResolvedValue({ control } as unknown as DaemonClient);
		const tool = captureTools(registerControlTools).get("internet_control");
		await tool?.execute("call", { action: "drain" }, undefined, undefined, { cwd: "/tmp" });
		expect(control).toHaveBeenCalledWith("drain", undefined);
	});
});
