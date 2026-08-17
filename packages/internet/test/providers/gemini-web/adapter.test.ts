import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GeminiWebTurnDriver } from "#runtime/browser/gemini-web/turn-driver";
import type { ParsedRequest } from "#runtime/core/protocol/types";
import { GeminiWebAdapter } from "#runtime/providers/gemini-web/adapter";
import type { GeminiWebProviderConfig } from "#runtime/providers/gemini-web/config";
import type { GeminiNativeConversationPolicy } from "#runtime/providers/gemini-web/conversation/policy";
import { GEMINI_WEB_HOME_URL } from "#runtime/providers/gemini-web/models";

function config(stateDir: string): GeminiWebProviderConfig {
	return {
		adapter: "gemini-web",
		baseUrl: GEMINI_WEB_HOME_URL,
		defaultModel: "gemini-web/flash",
		models: ["gemini-web/flash", "gemini-web/pro"],
		capabilityMarker: {
			version: 1,
			provider: "gemini-web",
			authenticatedAt: "2026-08-17T00:00:00.000Z",
			signOutHref: "https://accounts.google.com/SignOutOptions",
			capabilities: {
				version: 1,
				provider: "gemini-web",
				verifiedAt: "2026-08-17T00:00:00.000Z",
				labels: { flash: "3.7 Flash", thinking: "Extended thinking", pro: "3.1 Pro" },
				available: ["flash", "thinking", "pro"],
			},
		},
		geminiWeb: {
			storageStatePath: join(stateDir, "storage.json"),
			chromeExecutablePath: "/sanitized/chrome",
			conversationStateDir: stateDir,
		},
	};
}

function parsed(overrides: Record<string, unknown> = {}): ParsedRequest {
	return {
		modelId: "gemini-web/flash",
		sessionId: "pi-session-fixture",
		options: {},
		context: { systemPrompt: [], messages: [{ role: "user", content: "fixture prompt" }] },
		...overrides,
	} as unknown as ParsedRequest;
}

describe("Gemini Web adapter", () => {
	it("emits each driver delta once and never fabricates usage", async () => {
		const stateDir = mkdtempSync(join(tmpdir(), "gemini-web-adapter-"));
		const run = vi.fn(
			async (request: {
				model: { label: string };
				onTextDelta: (text: string) => void;
				resolveConversationUrl?: () => string | undefined;
				recordConversationUrl?: (conversationUrl: string) => void;
			}) => {
				expect(request.resolveConversationUrl?.()).toBeUndefined();
				expect(request.model.label).toBe("3.7 Flash");
				request.onTextDelta("Hello");
				request.onTextDelta(" Gemini");
				const conversationUrl = "https://gemini.google.com/app/abc123";
				request.recordConversationUrl?.(conversationUrl);
				return { text: "Hello Gemini", conversationUrl };
			},
		);
		const record = vi.fn();
		const driver = { run, close: vi.fn() } as unknown as GeminiWebTurnDriver;
		const policy = {
			resolve: vi.fn(() => undefined),
			record,
		} as unknown as GeminiNativeConversationPolicy;
		const adapter = new GeminiWebAdapter(config(stateDir), { driver, conversationPolicy: policy });
		const events: unknown[] = [];

		await adapter.runTurn(parsed(), { headers: new Headers() }, (event) => events.push(event));

		expect(events).toEqual([
			{ type: "text_delta", text: "Hello" },
			{ type: "text_delta", text: " Gemini" },
			{ type: "done", stopReason: "stop", endTurn: true },
		]);
		expect(events.some((event) => typeof event === "object" && event !== null && "usage" in event)).toBe(false);
		expect(record).toHaveBeenCalledWith("pi-session-fixture", "https://gemini.google.com/app/abc123");
	});

	it("selects Extended thinking when reasoning is enabled on a base model", async () => {
		const stateDir = mkdtempSync(join(tmpdir(), "gemini-web-adapter-"));
		const run = vi.fn(async (request: { model: { label: string } }) => {
			expect(request.model.label).toBe("Extended thinking");
			return { text: "Reasoned answer", conversationUrl: "https://gemini.google.com/app/reasoning" };
		});
		const driver = { run, close: vi.fn() } as unknown as GeminiWebTurnDriver;
		const policy = { resolve: vi.fn(() => undefined), record: vi.fn() } as unknown as GeminiNativeConversationPolicy;
		const adapter = new GeminiWebAdapter(config(stateDir), { driver, conversationPolicy: policy });

		await adapter.runTurn(parsed({ options: { reasoning: "high" } }), { headers: new Headers() }, () => {});

		expect(run).toHaveBeenCalledOnce();
	});

	it("fails closed when a continuation has no session mapping", async () => {
		const stateDir = mkdtempSync(join(tmpdir(), "gemini-web-adapter-"));
		const run = vi.fn(
			async (request: {
				requireExistingConversation?: boolean;
				resolveConversationUrl?: () => string | undefined;
			}) => {
				if (request.requireExistingConversation && !request.resolveConversationUrl?.()) {
					throw new Error("Gemini Web continuation state is missing for this Pi session");
				}
				throw new Error("unexpected browser turn");
			},
		);
		const driver = { run, close: vi.fn() } as unknown as GeminiWebTurnDriver;
		const policy = { resolve: vi.fn(() => undefined), record: vi.fn() } as unknown as GeminiNativeConversationPolicy;
		const adapter = new GeminiWebAdapter(config(stateDir), { driver, conversationPolicy: policy });

		await expect(
			adapter.runTurn(parsed({ previousResponseId: "resp_previous" }), { headers: new Headers() }, () => {}),
		).rejects.toThrow("continuation state is missing");
		expect(run).toHaveBeenCalledOnce();
	});

	it("rejects unsupported payloads before invoking the browser driver", async () => {
		const stateDir = mkdtempSync(join(tmpdir(), "gemini-web-adapter-"));
		const run = vi.fn();
		const driver = { run, close: vi.fn() } as unknown as GeminiWebTurnDriver;
		const policy = { resolve: vi.fn(() => undefined), record: vi.fn() } as unknown as GeminiNativeConversationPolicy;
		const adapter = new GeminiWebAdapter(config(stateDir), { driver, conversationPolicy: policy });

		await expect(
			adapter.runTurn(
				parsed({ context: { messages: [], files: [{ name: "fixture.txt" }] } }),
				{ headers: new Headers() },
				() => {},
			),
		).rejects.toThrow("images or files");
		expect(run).not.toHaveBeenCalled();
	});
});
