import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import { registerCompactTools } from "#internet/tools/compact";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet_compact", () => {
	it("refuses Luna compaction", async () => {
		const tool = captureTools(registerCompactTools).get("internet_compact");
		await expect(
			tool?.execute("call", { model: "chatgpt-web/luna", input: [{}] }, undefined, undefined, { cwd: "/tmp" }),
		).rejects.toThrow("disabled for Luna");
	});

	it("returns replacement history", async () => {
		const output = [{ type: "message", role: "user", content: [] }];
		vi.spyOn(AccountRegistry.prototype, "get").mockResolvedValue({ id: "default" } as never);
		vi.spyOn(DaemonClient, "forAccount").mockResolvedValue({
			compact: async () => ({ output }),
		} as unknown as DaemonClient);
		const tool = captureTools(registerCompactTools).get("internet_compact");
		const result = await tool?.execute("call", { model: "chatgpt-web/high", input: [{}] }, undefined, undefined, {
			cwd: "/tmp",
		});
		expect(result?.details).toEqual({ output });
	});
});
