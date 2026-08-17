import type { GeminiWebCapabilityMarker } from "#runtime/browser/gemini-web/capabilities";
import { resolveGeminiWebModelRoute } from "#runtime/providers/gemini-web/models";

function marker(available: GeminiWebCapabilityMarker["available"]): GeminiWebCapabilityMarker {
	return {
		version: 1,
		provider: "gemini-web",
		verifiedAt: "2026-08-17T00:00:00.000Z",
		labels: { flash: "3.7 Flash", thinking: "Extended thinking", pro: "3.1 Pro" },
		available,
	};
}

describe("Gemini model routes", () => {
	it("resolves the two public model IDs with account-visible labels", () => {
		expect(resolveGeminiWebModelRoute("gemini-web/flash", marker(["flash", "thinking", "pro"]))).toMatchObject({
			capability: "flash",
			label: "3.7 Flash",
		});
		expect(resolveGeminiWebModelRoute("gemini-web/pro", marker(["flash", "thinking", "pro"]))).toMatchObject({
			capability: "pro",
			label: "3.1 Pro",
		});
	});

	it("keeps Extended thinking internal instead of exposing it as a model", () => {
		expect(() => resolveGeminiWebModelRoute("gemini-web/thinking", marker(["flash", "thinking", "pro"]))).toThrow(
			"not supported",
		);
	});

	it("rejects unavailable account capabilities", () => {
		expect(() => resolveGeminiWebModelRoute("gemini-web/pro", marker(["flash"]))).toThrow("not available");
	});
});
