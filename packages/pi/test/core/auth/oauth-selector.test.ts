import { BUILT_IN_PROVIDER_DISPLAY_NAMES } from "@tsuuanmi/pi-ai";
import { initTheme, setKeybindings, stripAnsi } from "@tsuuanmi/pi-tui";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "#pi/auth/auth-storage";
import { OAuthSelectorComponent } from "#pi/modes/interactive/components/selectors/oauth-selector";
import { isApiKeyAccountProvider } from "#pi/modes/interactive/interactive-mode";
import { KeybindingsManager } from "#pi/settings/keybindings";

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

describe("OAuthSelectorComponent", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	afterEach(() => {
		if (originalOpenAiApiKey === undefined) {
			delete process.env.OPENAI_API_KEY;
		} else {
			process.env.OPENAI_API_KEY = originalOpenAiApiKey;
		}
	});

	it("keeps built-in API key providers separate from OAuth-only providers", () => {
		const oauthProviderIds = new Set(["anthropic", "custom-oauth"]);
		const builtInProviderIds = new Set(["anthropic", "openai"]);

		expect(isApiKeyAccountProvider("anthropic", oauthProviderIds, builtInProviderIds)).toBe(true);
		expect(BUILT_IN_PROVIDER_DISPLAY_NAMES.anthropic).toBe("Anthropic");
		expect(isApiKeyAccountProvider("openai", oauthProviderIds, builtInProviderIds)).toBe(true);
		expect(isApiKeyAccountProvider("custom-oauth", oauthProviderIds, builtInProviderIds)).toBe(false);
		expect(isApiKeyAccountProvider("custom-api", oauthProviderIds, builtInProviderIds)).toBe(true);
	});

	it("shows stored OAuth auth distinctly in the API key selector", () => {
		const authStorage = AuthStorage.inMemory({
			anthropic: {
				type: "oauth",
				access: "access-token",
				refresh: "refresh-token",
				expires: Date.now() + 60_000,
			},
		});
		const selector = new OAuthSelectorComponent(
			"add",
			authStorage,
			[{ id: "anthropic", name: "Anthropic", authType: "api_key" }],
			() => {},
			() => {},
		);

		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain("Anthropic");
		expect(output).toContain("subscription configured");
	});

	it("shows environment API key auth as configured", () => {
		process.env.OPENAI_API_KEY = "test-openai-key";
		const authStorage = AuthStorage.inMemory();
		const selector = new OAuthSelectorComponent(
			"add",
			authStorage,
			[{ id: "openai", name: "OpenAI", authType: "api_key" }],
			() => {},
			() => {},
		);

		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain("OpenAI");
		expect(output).toContain("✓ env: OPENAI_API_KEY");
		expect(output).not.toContain("unconfigured");
	});

	it("shows custom provider environment API key auth from status resolver", () => {
		const authStorage = AuthStorage.inMemory();
		const selector = new OAuthSelectorComponent(
			"add",
			authStorage,
			[{ id: "ollama", name: "ollama", authType: "api_key" }],
			() => {},
			() => {},
			() => ({ configured: true, source: "environment", label: "OLLAMA_API_KEY" }),
		);

		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain("ollama");
		expect(output).toContain("✓ env: OLLAMA_API_KEY");
		expect(output).not.toContain("unconfigured");
	});

	it("shows settings.json API key auth as configured", () => {
		const authStorage = AuthStorage.inMemory();
		const selector = new OAuthSelectorComponent(
			"add",
			authStorage,
			[{ id: "local-proxy", name: "local-proxy", authType: "api_key" }],
			() => {},
			() => {},
			() => ({ configured: true, source: "settings_json_key" }),
		);

		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain("local-proxy");
		expect(output).toContain("✓ key in settings.json");
		expect(output).not.toContain("unconfigured");
	});

	it("shows settings.json command auth as configured", () => {
		const authStorage = AuthStorage.inMemory();
		const selector = new OAuthSelectorComponent(
			"add",
			authStorage,
			[{ id: "op-proxy", name: "op-proxy", authType: "api_key" }],
			() => {},
			() => {},
			() => ({ configured: true, source: "settings_json_command" }),
		);

		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain("op-proxy");
		expect(output).toContain("✓ command in settings.json");
		expect(output).not.toContain("unconfigured");
	});
});
