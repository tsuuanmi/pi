import { registerCouncilTool } from "#internet/tools/council";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet council tool", () => {
	it("uses bounded presets and returns the synthesized answer", async () => {
		const run = vi.fn(async () => ({
			answer: "synthesis",
			members: [
				{ model: "chatgpt-web/luna", response: "first" },
				{ model: "chatgpt-web/sol", response: "second" },
			],
			chair: "chatgpt-web/luna",
			preset: "quick" as const,
		}));
		const tool = captureTools((host) => registerCouncilTool(host, { run })).get("internet_council");
		const signal = new AbortController().signal;
		const result = await tool?.execute(
			"call",
			{ question: "What should we do?", preset: "quick" },
			signal,
			undefined,
			{ sessionServices: {} } as never,
		);
		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({ question: "What should we do?", preset: "quick", signal }),
			{},
		);
		expect(result?.content).toEqual([{ type: "text", text: "synthesis" }]);
	});
});
