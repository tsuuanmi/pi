import { CHATGPT_WEB_LUNA_MODEL, CHATGPT_WEB_SOL_MODEL, isLunaModel } from "#internet/backends/openai/turn/model";

describe("ChatGPT Web model resolution", () => {
	it("recognizes the canonical Luna route", () => {
		expect(isLunaModel(CHATGPT_WEB_LUNA_MODEL)).toBe(true);
		expect(isLunaModel("gpt-5.6-luna")).toBe(true);
		expect(isLunaModel(CHATGPT_WEB_SOL_MODEL)).toBe(false);
	});
});
