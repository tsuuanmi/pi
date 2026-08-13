import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	BeforeProviderRequestEvent,
	ExtensionHandler,
	ToolCallEvent,
	ToolCallEventResult,
	TurnEndEvent,
} from "@tsuuanmi/pi/extensions";
import type { InternetAccount } from "#internet/core/types";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import { registerInternetHooks } from "#internet/hooks";
import type { InternetSettingsStore } from "#internet/settings";

async function account(): Promise<InternetAccount> {
	const configDir = await mkdtemp(join(tmpdir(), "pi-internet-hook-"));
	await mkdir(join(configDir, "browser"), { recursive: true });
	await writeFile(
		join(configDir, "browser", "login-marker.json"),
		JSON.stringify({ version: 2, authenticated: true, source: "authenticated-system-browser" }),
	);
	return {
		id: "default",
		backend: "openai",
		displayName: "ChatGPT Web",
		configDir,
		host: "127.0.0.1",
		port: 17841,
		enabled: true,
		conversationMode: "temporary",
	};
}

const autoLogin = (enabled: boolean) =>
	({
		get: vi.fn(async () => ({ autoLogin: enabled })),
	}) as unknown as InternetSettingsStore;

describe("registerInternetHooks", () => {
	it("blocks bridged tools and registers request/turn hooks without eager daemon shutdown", async () => {
		let toolCall: ExtensionHandler<ToolCallEvent, ToolCallEventResult> | undefined;
		let turnEnd: ExtensionHandler<TurnEndEvent> | undefined;
		const events: string[] = [];
		registerInternetHooks(
			{
				on(event: "tool_call" | "turn_end" | "before_provider_request", handler: unknown) {
					events.push(event);
					if (event === "tool_call") toolCall = handler as ExtensionHandler<ToolCallEvent, ToolCallEventResult>;
					else if (event === "turn_end") turnEnd = handler as ExtensionHandler<TurnEndEvent>;
				},
			},
			{} as unknown as OwnedDaemonManager,
			[await account()],
			autoLogin(true),
		);
		const result = await toolCall?.({ type: "tool_call", toolCallId: "call", toolName: "codex_exec", input: {} }, {
			hasUI: false,
		} as never);
		expect(result).toMatchObject({ block: true });
		expect(turnEnd).toBeDefined();
		expect(events).not.toContain("session_shutdown");
	});

	it("readiness-gates only registered internet providers", async () => {
		let beforeRequest: ExtensionHandler<BeforeProviderRequestEvent, unknown> | undefined;
		const ensureReady = vi.fn(async () => {});
		registerInternetHooks(
			{
				on(event: "tool_call" | "turn_end" | "before_provider_request" | "session_shutdown", handler: unknown) {
					if (event === "before_provider_request")
						beforeRequest = handler as ExtensionHandler<BeforeProviderRequestEvent, unknown>;
				},
			},
			{ ensureReady } as unknown as OwnedDaemonManager,
			[await account()],
			autoLogin(true),
		);
		const payload = {
			input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "test" }] }],
		};
		const context = {
			cwd: "/workspace/pi",
			model: { provider: "chatgpt-web" },
			sessionManager: {
				getSessionId: () => "session-123",
				getBranch: () => [
					{
						type: "message",
						id: "user-entry-1",
						message: { role: "user" },
					},
				],
			},
		};
		const adapted = (await beforeRequest?.({ type: "before_provider_request", payload }, context as never)) as Record<
			string,
			unknown
		>;
		expect(adapted).not.toBe(payload);
		expect(adapted.input).toHaveLength(2);
		expect(adapted.client_metadata).toMatchObject({ "x-codex-turn-metadata": expect.any(String) });
		expect(ensureReady).toHaveBeenCalledWith("default");
		await expect(
			beforeRequest?.({ type: "before_provider_request", payload }, {
				...context,
				model: { provider: "anthropic" },
			} as never),
		).resolves.toBe(payload);
		expect(ensureReady).toHaveBeenCalledOnce();
	});

	it("does not open login when auto-login is disabled", async () => {
		let beforeRequest: ExtensionHandler<BeforeProviderRequestEvent, unknown> | undefined;
		const ensureReady = vi.fn(async () => {});
		const target = await account();
		await writeFile(join(target.configDir, "browser", "login-marker.json"), "{}\n");
		registerInternetHooks(
			{
				on(event: string, handler: unknown) {
					if (event === "before_provider_request")
						beforeRequest = handler as ExtensionHandler<BeforeProviderRequestEvent, unknown>;
				},
			},
			{ ensureReady } as unknown as OwnedDaemonManager,
			[target],
			autoLogin(false),
		);
		const notify = vi.fn();
		const payload = { input: "sensitive user content" };
		const result = await beforeRequest?.({ type: "before_provider_request", payload }, {
			model: { provider: "chatgpt-web" },
			hasUI: true,
			ui: { notify },
		} as never);
		expectRejectedRequest(result);
		expect(ensureReady).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("internet_daemon"), "warning");
	});

	it("fails closed when readiness or request adaptation fails", async () => {
		let beforeRequest: ExtensionHandler<BeforeProviderRequestEvent, unknown> | undefined;
		const ensureReady = vi.fn<() => Promise<void>>(async () => {
			throw new Error("daemon unavailable");
		});
		registerInternetHooks(
			{
				on(event: string, handler: unknown) {
					if (event === "before_provider_request")
						beforeRequest = handler as ExtensionHandler<BeforeProviderRequestEvent, unknown>;
				},
			},
			{ ensureReady } as unknown as OwnedDaemonManager,
			[await account()],
			autoLogin(true),
		);
		const notify = vi.fn();
		const context = {
			cwd: "/workspace/pi",
			model: { provider: "chatgpt-web" },
			hasUI: true,
			ui: { notify },
			sessionManager: { getSessionId: () => "session-123", getBranch: () => [] },
		};
		expectRejectedRequest(
			await beforeRequest?.(
				{ type: "before_provider_request", payload: { input: "sensitive user content" } },
				context as never,
			),
		);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("request preparation failed"), "error");

		ensureReady.mockResolvedValueOnce(undefined);
		expectRejectedRequest(
			await beforeRequest?.(
				{
					type: "before_provider_request",
					payload: { input: [{ type: "message", role: "user", content: "sensitive user content" }] },
				},
				context as never,
			),
		);
	});
});

function expectRejectedRequest(value: unknown): void {
	expect(value).toEqual({
		model: "chatgpt-web/__request-rejected__",
		input: [],
		stream: true,
		store: false,
	});
	expect(JSON.stringify(value)).not.toContain("sensitive user content");
}
