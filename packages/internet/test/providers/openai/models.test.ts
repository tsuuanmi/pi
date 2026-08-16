import { chatGptWebModels } from "#internet/providers/openai/models";

function supportedThinkingLevels(model: ReturnType<typeof chatGptWebModels>[number]): string[] {
	return Object.entries(model.thinkingLevelMap ?? {})
		.filter(([, value]) => value !== null)
		.map(([level]) => level);
}

describe("chatGptWebModels", () => {
	it("publishes separate immutable-effort Sol routes", () => {
		const models = chatGptWebModels({ proAvailable: false });
		expect(models.map((model) => model.id)).toEqual(["light", "medium", "high"]);
		expect(models.map(supportedThinkingLevels)).toEqual([["low"], ["medium"], ["high"]]);
		expect(models.map((model) => model.contextWindow)).toEqual([41_000, 90_000, 90_000]);
		expect(models.every((model) => model.maxTokens === 16_384)).toBe(true);
	});

	it("gates Pro routes while always publishing canonical Sol routes", () => {
		const pro = chatGptWebModels({ proAvailable: true });
		expect(pro.map((model) => model.id)).toEqual(["light", "medium", "high", "extra-high", "pro"]);
		expect(pro.map((model) => model.contextWindow)).toEqual([111_193, 111_193, 111_193, 111_193, 112_193]);
		const standard = chatGptWebModels({ proAvailable: false });
		expect(standard.map((model) => model.id)).toEqual(["light", "medium", "high"]);
	});
});
