import {
	CHATGPT_WEB_LUNA_MODEL_ROUTE,
	CHATGPT_WEB_MODEL_ROUTES,
	isLunaModel,
} from "#internet/backends/openai/turn/model";

describe("ChatGPT Web model resolution", () => {
	it("publishes the daemon route identifiers without legacy aliases", () => {
		expect(CHATGPT_WEB_MODEL_ROUTES.map((route) => route.id)).toEqual([
			"chatgpt-web/light",
			"chatgpt-web/medium",
			"chatgpt-web/high",
			"chatgpt-web/extra-high",
			"chatgpt-web/pro",
		]);
		expect(isLunaModel(CHATGPT_WEB_LUNA_MODEL_ROUTE.id)).toBe(true);
		expect(isLunaModel("gpt-5.6-luna")).toBe(false);
	});
});
