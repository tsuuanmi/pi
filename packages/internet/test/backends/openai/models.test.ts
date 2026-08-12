import { chatGptWebModels } from "#internet/backends/openai/models";

function supportedThinkingLevels(model: ReturnType<typeof chatGptWebModels>[number]): string[] {
	return Object.entries(model.thinkingLevelMap ?? {})
		.filter(([, value]) => value !== null)
		.map(([level]) => level);
}

describe("chatGptWebModels", () => {
	it("publishes separate immutable-effort Sol routes", () => {
		const models = chatGptWebModels({ solAvailable: true, proAvailable: false });
		expect(models.map((model) => model.id)).toEqual(["chatgpt-web/light", "chatgpt-web/medium", "chatgpt-web/high"]);
		expect(models.map(supportedThinkingLevels)).toEqual([["low"], ["medium"], ["high"]]);
		expect(models.map((model) => model.contextWindow)).toEqual([41_000, 90_000, 90_000]);
		expect(models.every((model) => model.maxTokens === 16_384)).toBe(true);
	});

	it("gates Pro routes and keeps Luna mutually exclusive with Sol", () => {
		const pro = chatGptWebModels({ solAvailable: true, proAvailable: true });
		expect(pro.map((model) => model.id)).toEqual([
			"chatgpt-web/light",
			"chatgpt-web/medium",
			"chatgpt-web/high",
			"chatgpt-web/extra-high",
			"chatgpt-web/pro",
		]);
		expect(pro.map((model) => model.contextWindow)).toEqual([111_193, 111_193, 111_193, 111_193, 112_193]);
		const luna = chatGptWebModels({ solAvailable: false, proAvailable: false });
		expect(luna.map((model) => model.id)).toEqual(["chatgpt-web/luna"]);
		expect(supportedThinkingLevels(luna[0]!)).toEqual(["low"]);
	});
});
