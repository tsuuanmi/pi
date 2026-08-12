import type { DaemonClient } from "#internet/backends/openai/daemon/client";

export interface WaitForHealthOptions {
	timeoutMs?: number;
	intervalMs?: number;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDaemonHealth(
	client: Pick<DaemonClient, "health">,
	options: WaitForHealthOptions = {},
): Promise<void> {
	const timeoutMs = options.timeoutMs ?? 30_000;
	const intervalMs = options.intervalMs ?? 200;
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await client.health();
			return;
		} catch (error) {
			lastError = error;
			await delay(intervalMs);
		}
	}
	throw new Error("ChatGPT Web daemon did not become healthy before the startup timeout.", { cause: lastError });
}
