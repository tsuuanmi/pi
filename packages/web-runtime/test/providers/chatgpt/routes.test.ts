import { describe, expect, test } from "vitest";
import { CHATGPT_ROUTES, getChatGptRoute } from "../../../src/providers/chatgpt/routes.ts";

describe("ChatGPT routes", () => {
	test("maps each Pi route to one structural effort item", () => {
		expect(CHATGPT_ROUTES.map((route) => route.effortIndex)).toEqual([0, 1, 2, 3, 4]);
		expect(getChatGptRoute("extra-high").name).toBe("ChatGPT Extra High");
	});

	test("advertises only implemented output capabilities", () => {
		for (const route of CHATGPT_ROUTES) expect(route.output).toEqual(["text", "reasoning"]);
	});

	test("rejects unknown routes", () => {
		expect(() => getChatGptRoute("unknown")).toThrow(/unsupported ChatGPT route/);
	});
});
