import { describe, expect, test } from "vitest";
import { getSupportedThinkingLevels } from "#ai/model/catalog";
import type { Model } from "#ai/model/index";
import { fromCodex } from "#ai/provider/openai/codex/catalog";

const provider = {
	source: "openai-codex",
	provider: "openai-codex",
	api: "openai-codex-responses",
	baseUrl: "https://chatgpt.com/backend-api",
} as const;

function apiModel(id: string): Model<"openai-responses"> {
	return {
		id,
		name: id,
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	};
}

function catalogModel(
	slug: string,
	efforts: string[],
): {
	slug: string;
	display_name: string;
	context_window: number;
	supported_reasoning_levels: { effort: string }[];
} {
	return {
		slug,
		display_name: slug,
		context_window: 128000,
		supported_reasoning_levels: efforts.map((effort) => ({ effort })),
	};
}

describe("Codex model catalog", () => {
	test("uses the upstream reasoning levels exactly", () => {
		const models = new Map([
			["gpt-5.6-luna", apiModel("gpt-5.6-luna")],
			["gpt-5.6-sol", apiModel("gpt-5.6-sol")],
		]);
		const catalog = {
			models: [
				catalogModel("gpt-5.6-luna", ["low", "medium", "high", "xhigh", "max"]),
				catalogModel("gpt-5.6-sol", ["low", "medium", "high", "xhigh", "max", "ultra"]),
			],
		};

		const result = fromCodex(catalog, models, provider);
		const luna = result.find((model) => model.id === "gpt-5.6-luna");
		const sol = result.find((model) => model.id === "gpt-5.6-sol");
		if (!luna || !sol) throw new Error("Codex fixture models were not generated");

		expect(luna.thinkingLevelMap).toEqual({
			off: null,
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max",
			ultra: null,
		});
		expect(sol.thinkingLevelMap?.ultra).toBe("ultra");
		expect(getSupportedThinkingLevels(luna)).toEqual(["low", "medium", "high", "xhigh", "max"]);
		expect(getSupportedThinkingLevels(sol)).toEqual(["low", "medium", "high", "xhigh", "max", "ultra"]);
	});
});
