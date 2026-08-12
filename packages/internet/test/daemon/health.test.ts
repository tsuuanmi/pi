import { waitForDaemonHealth } from "#internet/daemon/health";

describe("waitForDaemonHealth", () => {
	it("retries until the daemon is healthy", async () => {
		const health = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ status: "ok" });
		await waitForDaemonHealth({ health } as never, { timeoutMs: 100, intervalMs: 1 });
		expect(health).toHaveBeenCalledTimes(2);
	});

	it("reports the startup timeout", async () => {
		const health = vi.fn().mockRejectedValue(new Error("offline"));
		await expect(waitForDaemonHealth({ health } as never, { timeoutMs: 2, intervalMs: 1 })).rejects.toThrow(
			"did not become healthy",
		);
	});
});
