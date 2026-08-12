import { CHATGPT_WEB_MODELS } from "#internet/backends/openai/models";

describe("CHATGPT_WEB_MODELS", () => {
	it("publishes daemon-supported Sol and Luna routes", () => {
		expect(CHATGPT_WEB_MODELS.map((model) => model.id)).toEqual(["chatgpt-web/high", "chatgpt-web/luna"]);
		expect(CHATGPT_WEB_MODELS.every((model) => model.input.includes("image"))).toBe(true);
		expect(CHATGPT_WEB_MODELS.map((model) => model.contextWindow)).toEqual([90_000, 1_050_000]);
	});
});
