import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import { registerStatusTools } from "#internet/tools/status";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet_status", () => {
	it("returns daemon health", async () => {
		vi.spyOn(AccountRegistry.prototype, "get").mockResolvedValue({ id: "default" } as never);
		vi.spyOn(DaemonClient, "forAccount").mockResolvedValue({
			baseUrl: () => "http://127.0.0.1:17841",
			health: async () => ({ status: "ok", accepting_turns: true, active_http_turns: 1, active_browser_turns: 2 }),
		} as DaemonClient);
		const tool = captureTools(registerStatusTools).get("internet_status");
		const result = await tool?.execute("call", {}, undefined, undefined, { cwd: "/tmp" });
		expect(result?.details).toMatchObject({ active_http_turns: 1, active_browser_turns: 2 });
	});
});
