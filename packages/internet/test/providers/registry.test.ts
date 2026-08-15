import type { InternetAccount } from "#internet/core/types";
import { internetProviderName, registerInternetProviders } from "#internet/providers/registry";

const accounts: InternetAccount[] = [
	{
		id: "research",
		provider: "anthropic",
		displayName: "Anthropic Research",
		enabled: true,
		apiKeyEnv: "ANTHROPIC_RESEARCH_KEY",
	},
	{
		id: "google",
		provider: "google",
		displayName: "Gemini Research",
		enabled: true,
		apiKeyEnv: "GEMINI_RESEARCH_KEY",
	},
];

describe("internet provider registry", () => {
	it("uses one naming and registration path for enabled providers", async () => {
		const registered: string[] = [];
		await registerInternetProviders({ registerProvider: (name) => registered.push(name) }, accounts);
		expect(registered).toEqual(["anthropic-api-research", "gemini-api-google"]);
		expect(accounts.map(internetProviderName)).toEqual(registered);
	});
});
