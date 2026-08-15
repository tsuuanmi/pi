import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/providers/openai/daemon/client";
import { registerCompactTools } from "#internet/tools/compact";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet_compact", () => {
	it("refuses Luna compaction", async () => {
		const tool = captureTools(registerCompactTools).get("internet_compact");
		await expect(
			tool?.execute("call", { model: "luna", input: [{}] }, undefined, undefined, {} as never),
		).rejects.toThrow("disabled for Luna");
	});

	it("returns replacement history through the canonical daemon model route", async () => {
		const output = [{ type: "message", role: "user", content: [] }];
		const compact = vi.fn(async () => ({ output }));
		vi.spyOn(AccountRegistry.prototype, "getOpenAi").mockResolvedValue({ id: "default" } as never);
		vi.spyOn(DaemonClient, "forAccount").mockResolvedValue({ compact } as unknown as DaemonClient);
		const tool = captureTools(registerCompactTools).get("internet_compact");
		const result = await tool?.execute("call", { model: "high", input: [{}] }, undefined, undefined, {} as never);
		expect(result?.details).toEqual({ output });
		expect(compact).toHaveBeenCalledWith(
			{ model: "chatgpt-web/high", input: [{}], instructions: undefined },
			undefined,
		);
	});
});
