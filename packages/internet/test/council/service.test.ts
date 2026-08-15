import type { AgentSessionServices } from "@tsuuanmi/pi";
import type { OpenAiInternetAccount } from "#internet/core/types";
import { CouncilService } from "#internet/council/service";

const account: OpenAiInternetAccount = {
	id: "default",
	provider: "openai",
	displayName: "ChatGPT Web",
	configDir: "/tmp/chatgpt",
	host: "127.0.0.1",
	port: 17841,
	enabled: true,
	conversationMode: "temporary",
};

describe("CouncilService", () => {
	it("requires at least two available internet models", async () => {
		const services = { modelRegistry: { getAvailable: () => [] } } as unknown as AgentSessionServices;
		await expect(
			new CouncilService([account]).run({ question: "Question", preset: "quick" }, services),
		).rejects.toThrow("at least two available models");
	});
});
