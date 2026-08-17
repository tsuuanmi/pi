import type { GeminiWebCapabilityMarker } from "#runtime/browser/gemini-web/capabilities";
import { resolveGeminiWebModelRoute } from "#runtime/providers/gemini-web/models";

function marker(available: GeminiWebCapabilityMarker["available"]): GeminiWebCapabilityMarker {
	return {
		version: 1,
		provider: "gemini-web",
		verifiedAt: "2026-08-17T00:00:00.000Z",
		labels: { flash: "3.6 Flash", thinking: "3.6 Thinking", pro: "3.1 Pro" },
		available,
	};
}

describe("Gemini model routes", () => {
	it("resolves stable provider model IDs with account-visible labels", () => {
		expect(resolveGeminiWebModelRoute("gemini-web/thinking", marker(["flash", "thinking", "pro"]))).toMatchObject({
			capability: "thinking",
			label: "3.6 Thinking",
		});
	});

	it("rejects unavailable account capabilities", () => {
		expect(() => resolveGeminiWebModelRoute("gemini-web/pro", marker(["flash"]))).toThrow("not available");
	});
});
