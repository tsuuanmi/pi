import { describe, expect, it } from "vitest";
import { parseSettings, serializeSettings, SettingsFormatError } from "#pi/settings/codec";

describe("settings codec", () => {
	it("parses the current settings contract", () => {
		const settings = parseSettings(
			JSON.stringify({
				defaultProvider: "anthropic",
				defaultThinkingLevel: "high",
				transport: "sse",
				packages: [{ source: "npm:test", extensions: ["index.js"] }],
				providers: { custom: { baseUrl: "https://example.test", api: "openai-responses" } },
				retry: { enabled: true, maxRetries: 2 },
			}),
		);
		expect(settings.defaultProvider).toBe("anthropic");
	});

	it.each([
		[{ obsolete: true }, "settings.obsolete: is not supported"],
		[{ defaultThinkingLevel: "extreme" }, "settings.defaultThinkingLevel: is not a thinking level"],
		[{ packages: "npm:test" }, "settings.packages: must be an array"],
		[{ retry: { maxRetries: -1 } }, "settings.retry.maxRetries: must be a non-negative integer"],
		[{ providers: { custom: { obsolete: true } } }, "settings.providers.custom.obsolete: is not supported"],
	] as const)("rejects invalid settings %#", (value, message) => {
		expect(() => parseSettings(JSON.stringify(value))).toThrow(message);
	});

	it("reports malformed JSON without exposing its contents", () => {
		expect(() => parseSettings('{"apiKey":"secret"', "global settings")).toThrow(SettingsFormatError);
		expect(() => parseSettings('{"apiKey":"secret"', "global settings")).toThrow(
			"global settings: is not valid JSON",
		);
	});

	it("serializes validated settings with a trailing newline", () => {
		expect(serializeSettings({ theme: "dark" })).toBe('{\n  "theme": "dark"\n}\n');
	});
});
