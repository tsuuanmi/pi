import { DaemonClient } from "#internet/providers/openai/daemon/client";

const config = { host: "127.0.0.1", port: 17841, controlToken: "secret", configDir: "/tmp/web" };

describe("DaemonClient", () => {
	it("reads health without auth and authenticates control calls", async () => {
		const requests: Array<{ url: string; init: RequestInit }> = [];
		const fetch = async (input: string | URL | Request, init?: RequestInit) => {
			requests.push({ url: String(input), init: init ?? {} });
			return Response.json({ status: "ok", accepting_turns: true, active_http_turns: 0, active_adapter_turns: 0 });
		};
		const client = await DaemonClient.create({ config, fetch: fetch as typeof globalThis.fetch });
		await client.health();
		await client.control("drain");
		expect(requests[0]?.init.headers).toBeUndefined();
		expect(requests[1]?.init.headers).toEqual({ authorization: "Bearer secret" });
	});

	it("uses a browser-turn timeout for the conversation canary", async () => {
		const timeout = vi.spyOn(AbortSignal, "timeout");
		const fetch = async () => Response.json({ status: "passed" });
		const client = await DaemonClient.create({ config, fetch: fetch as typeof globalThis.fetch });

		await client.health();
		await client.conversationCanary();

		expect(timeout).toHaveBeenNthCalledWith(1, 5_000);
		expect(timeout).toHaveBeenNthCalledWith(2, 120_000);
		timeout.mockRestore();
	});

	it("classifies daemon errors", async () => {
		const fetch = async () => new Response("draining", { status: 503 });
		const client = await DaemonClient.create({ config, fetch: fetch as typeof globalThis.fetch });
		await expect(client.health()).rejects.toMatchObject({ code: "daemon_rejected", status: 503, retryable: true });
	});
});
