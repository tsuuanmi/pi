import { BrowserStageTimeoutError, BrowserTurnRunner, runBrowserStage } from "#runtime/browser/turn";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("runBrowserStage", () => {
	it("aborts and contains an action that exceeds its deadline", async () => {
		let stageSignal: AbortSignal | undefined;
		const onTimeout = vi.fn(async () => {});
		const stage = runBrowserStage({
			label: "test",
			traceId: "trace",
			stage: "interaction",
			timeoutMs: 10,
			action: async (signal) => {
				stageSignal = signal;
				return new Promise<string>(() => {});
			},
			onTimeout,
		});

		await expect(stage).rejects.toBeInstanceOf(BrowserStageTimeoutError);
		expect(stageSignal?.aborted).toBe(true);
		expect(onTimeout).toHaveBeenCalledOnce();
	});
});

describe("BrowserTurnRunner", () => {
	it("waits for active turns before running exclusive maintenance", async () => {
		const runner = new BrowserTurnRunner<string>({ maxConcurrent: 1, label: "test" });
		const active = deferred<string>();
		const turn = runner.run("turn", () => active.promise);
		const maintenance = vi.fn(async () => "maintained");
		const pendingMaintenance = runner.enqueueMaintenance(maintenance);

		await expect(runner.run("blocked", async () => "blocked")).rejects.toThrow("maintenance is active");
		expect(maintenance).not.toHaveBeenCalled();
		active.resolve("complete");
		await expect(turn).resolves.toBe("complete");
		await expect(pendingMaintenance).resolves.toBe("maintained");
	});

	it("rejects new work after closing begins", async () => {
		const runner = new BrowserTurnRunner<string>({ maxConcurrent: 1, label: "test" });
		await runner.close();
		await expect(runner.run("turn", async () => "value")).rejects.toThrow("runner is closing");
		await expect(runner.enqueueMaintenance(async () => "value")).rejects.toThrow("runner is closing");
	});
});
