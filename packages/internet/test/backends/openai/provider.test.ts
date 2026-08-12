import { createOpenAiProviderConfig, providerName, registerOpenAiProviders } from "#internet/backends/openai/provider";
import type { InternetAccount } from "#internet/core/types";

const account: InternetAccount = {
	id: "work",
	backend: "openai",
	displayName: "Work ChatGPT",
	configDir: "/tmp/work",
	host: "127.0.0.1",
	port: 18001,
	enabled: true,
};

describe("OpenAI provider registration", () => {
	it("builds a loopback native Responses provider", () => {
		expect(createOpenAiProviderConfig(account)).toMatchObject({
			api: "openai-responses",
			baseUrl: "http://127.0.0.1:18001/v1",
			authHeader: false,
		});
		expect(createOpenAiProviderConfig(account)).not.toHaveProperty("stream");
	});

	it("uses stable account-based provider names", () => {
		const registrations: string[] = [];
		registerOpenAiProviders({ registerProvider: (name) => registrations.push(name) }, [account]);
		expect(registrations).toEqual(["chatgpt-web-work"]);
		expect(providerName({ ...account, id: "default" })).toBe("chatgpt-web");
	});
});
