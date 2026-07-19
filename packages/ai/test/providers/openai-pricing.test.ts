import { describe, expect, it } from "vitest";
import type { Usage } from "#ai/core/types";
import { applyOpenAIServiceTierPricing, getOpenAIServiceTierCostMultiplier } from "#ai/providers/openai/pricing";

function usage(): Usage {
	return {
		input: 10,
		output: 20,
		cacheRead: 30,
		cacheWrite: 40,
		totalTokens: 100,
		cost: {
			input: 1,
			output: 2,
			cacheRead: 3,
			cacheWrite: 4,
			total: 10,
		},
	};
}

describe("OpenAI service-tier pricing", () => {
	it("keeps default pricing unchanged", () => {
		const value = usage();

		applyOpenAIServiceTierPricing(value, "default", { id: "gpt-5.4" });

		expect(getOpenAIServiceTierCostMultiplier({ id: "gpt-5.4" }, undefined)).toBe(1);
		expect(getOpenAIServiceTierCostMultiplier({ id: "gpt-5.4" }, "auto")).toBe(1);
		expect(value.cost).toEqual({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 });
	});

	it("applies flex and priority multipliers", () => {
		expect(getOpenAIServiceTierCostMultiplier({ id: "gpt-5.4" }, "flex")).toBe(0.5);
		expect(getOpenAIServiceTierCostMultiplier({ id: "gpt-5.4" }, "priority")).toBe(2);
		expect(getOpenAIServiceTierCostMultiplier({ id: "gpt-5.5" }, "priority")).toBe(2.5);
	});

	it("applies flex pricing in place", () => {
		const value = usage();
		const returned = applyOpenAIServiceTierPricing(value, "flex", { id: "gpt-5.4" });

		expect(returned).toBeUndefined();
		expect(value.cost).toEqual({ input: 0.5, output: 1, cacheRead: 1.5, cacheWrite: 2, total: 5 });
		expect(value).toMatchObject({ input: 10, output: 20, cacheRead: 30, cacheWrite: 40, totalTokens: 100 });
	});

	it("recomputes total from adjusted cost components", () => {
		const value = usage();

		applyOpenAIServiceTierPricing(value, "priority", { id: "gpt-5.5" });

		expect(value.cost).toEqual({ input: 2.5, output: 5, cacheRead: 7.5, cacheWrite: 10, total: 25 });
	});
});
