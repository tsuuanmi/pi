import {
	CHATGPT_WEB_LUNA_MODEL_ROUTE,
	CHATGPT_WEB_MODEL_ROUTES,
	chatGptWebBackendModelId,
	isLunaModel,
} from "#internet/providers/openai/turn/model";

describe("ChatGPT Web model resolution", () => {
	it("publishes concise provider-local model identifiers", () => {
		expect(CHATGPT_WEB_MODEL_ROUTES.map((route) => route.id)).toEqual([
			"light",
			"medium",
			"high",
			"extra-high",
			"pro",
		]);
		expect(CHATGPT_WEB_MODEL_ROUTES.map((route) => route.backendId)).toEqual([
			"chatgpt-web/light",
			"chatgpt-web/medium",
			"chatgpt-web/high",
			"chatgpt-web/extra-high",
			"chatgpt-web/pro",
		]);
		expect(isLunaModel(CHATGPT_WEB_LUNA_MODEL_ROUTE.id)).toBe(true);
		expect(isLunaModel(CHATGPT_WEB_LUNA_MODEL_ROUTE.backendId)).toBe(true);
		expect(isLunaModel("gpt-5.6-luna")).toBe(false);
	});

	it("maps provider-local and canonical daemon model identifiers to one backend route", () => {
		expect(chatGptWebBackendModelId("high")).toBe("chatgpt-web/high");
		expect(chatGptWebBackendModelId("chatgpt-web/high")).toBe("chatgpt-web/high");
		expect(chatGptWebBackendModelId("unknown")).toBeUndefined();
	});
});
