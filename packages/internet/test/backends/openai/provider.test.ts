import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpenAiProviderConfig, providerName, registerOpenAiProviders } from "#internet/backends/openai/provider";
import type { InternetAccount } from "#internet/core/types";

async function account(): Promise<InternetAccount> {
	const configDir = await mkdtemp(join(tmpdir(), "pi-internet-provider-"));
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({
			version: 3,
			mode: "browser-only",
			host: "127.0.0.1",
			port: 18001,
			controlToken: "x".repeat(40),
			solAvailable: false,
			proAvailable: false,
		}),
		{ mode: 0o600 },
	);
	return {
		id: "work",
		backend: "openai",
		displayName: "Work ChatGPT",
		configDir,
		host: "127.0.0.1",
		port: 18001,
		enabled: true,
	};
}

describe("OpenAI provider registration", () => {
	it("builds a loopback provider with capability-scoped models", async () => {
		const target = await account();
		const config = await createOpenAiProviderConfig(target);
		expect(config).toMatchObject({
			api: "openai-responses",
			baseUrl: "http://127.0.0.1:18001/v1",
			authHeader: false,
		});
		expect(config.models?.map((model) => model.id)).toEqual(["chatgpt-web/luna"]);
		expect(config).not.toHaveProperty("stream");
	});

	it("uses stable account-based provider names", async () => {
		const target = await account();
		const registrations: string[] = [];
		await registerOpenAiProviders({ registerProvider: (name) => registrations.push(name) }, [target]);
		expect(registrations).toEqual(["chatgpt-web-work"]);
		expect(providerName({ ...target, id: "default" })).toBe("chatgpt-web");
	});
});
