import { createGeminiCapabilityMarker, discoverGeminiCapabilities } from "#runtime/browser/gemini-web/capabilities";

const menuItems = [
	{ label: "3.5 Flash-Lite", selected: false, active: true },
	{ label: "3.7 Flash", selected: false, active: true },
	{ label: "Extended thinking", selected: true, active: true },
	{ label: "3.1 Pro", selected: false, active: true },
	{ label: "unrelated capability", selected: false, active: true },
];

describe("Gemini model capabilities", () => {
	it("maps live menu labels to stable internal capabilities", () => {
		expect(discoverGeminiCapabilities(menuItems)).toEqual([
			{ id: "flash", label: "3.7 Flash", available: true, selected: false },
			{ id: "thinking", label: "Extended thinking", available: true, selected: true },
			{ id: "pro", label: "3.1 Pro", available: true, selected: false },
		]);
	});

	it("discovers availability instead of assuming every capability exists", () => {
		const discovered = discoverGeminiCapabilities([{ label: "3.6 Flash", selected: true, active: true }]);
		expect(discovered.find((capability) => capability.id === "flash")?.available).toBe(true);
		expect(discovered.find((capability) => capability.id === "thinking")?.available).toBe(false);
	});

	it("creates a versioned marker from verified labels", () => {
		const marker = createGeminiCapabilityMarker(discoverGeminiCapabilities(menuItems), "2026-08-17T00:00:00.000Z");
		expect(marker.labels).toEqual({ flash: "3.7 Flash", thinking: "Extended thinking", pro: "3.1 Pro" });
		expect(marker.available).toEqual(["flash", "thinking", "pro"]);
	});
});
