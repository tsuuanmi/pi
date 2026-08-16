import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionEvent,
	ExtensionEventHandler,
	ExtensionHookHandler,
} from "@tsuuanmi/pi/extensions";
import type { OpenAiInternetAccount } from "#internet/core/types";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import { registerInternetHooks } from "#internet/hooks";
import type { InternetSettingsStore } from "#internet/settings";

type BeforeRequestHandler = ExtensionHookHandler<"before_provider_request">;
type ToolCallHandler = ExtensionHookHandler<"tool_call">;
type TurnEndHandler = ExtensionEventHandler<Extract<ExtensionEvent, { type: "turn_end" }>>;

interface CapturedHandlers {
	types: string[];
	beforeRequest?: BeforeRequestHandler;
	toolCall?: ToolCallHandler;
	turnEnd?: TurnEndHandler;
}

function captureHandlers(captured: CapturedHandlers): Pick<ExtensionAPI, "on" | "onHook"> {
	return {
		on(type: string, handler: unknown) {
			captured.types.push(type);
			if (type === "turn_end") captured.turnEnd = handler as TurnEndHandler;
		},
		onHook(type: string, handler: unknown) {
			captured.types.push(type);
			if (type === "tool_call") captured.toolCall = handler as ToolCallHandler;
			if (type === "before_provider_request") captured.beforeRequest = handler as BeforeRequestHandler;
		},
	} as unknown as Pick<ExtensionAPI, "on" | "onHook">;
}

async function account(): Promise<OpenAiInternetAccount> {
	const configDir = await mkdtemp(join(tmpdir(), "pi-internet-hook-"));
	await mkdir(join(configDir, "browser"), { recursive: true });
	await writeFile(
		join(configDir, "browser", "login-marker.json"),
		JSON.stringify({ version: 2, authenticated: true, source: "authenticated-system-browser" }),
	);
	return {
		id: "default",
		provider: "openai",
		displayName: "ChatGPT Web",
		configDir,
		host: "127.0.0.1",
		port: 17841,
		enabled: true,
	};
}

const autoLogin = (enabled: boolean) =>
	({
		get: vi.fn(async () => ({ autoLogin: enabled })),
	}) as unknown as InternetSettingsStore;

describe("registerInternetHooks", () => {
	it("blocks bridged tools and registers request/turn hooks without eager daemon shutdown", async () => {
		const captured: CapturedHandlers = { types: [] };
		registerInternetHooks(
			captureHandlers(captured),
			{} as unknown as OwnedDaemonManager,
			[await account()],
			autoLogin(true),
		);
		const result = await captured.toolCall?.(
			{ type: "tool_call", toolCallId: "call", toolName: "codex_exec", input: {} },
			{ hasUI: false } as never,
		);
		expect(result).toMatchObject({ block: true });
		expect(captured.turnEnd).toBeDefined();
		expect(captured.types).not.toContain("session_shutdown");
	});

	it("readiness-gates only registered internet providers", async () => {
		const captured: CapturedHandlers = { types: [] };
		const ensureReady = vi.fn(async () => {});
		registerInternetHooks(
			captureHandlers(captured),
			{ ensureReady } as unknown as OwnedDaemonManager,
			[await account()],
			autoLogin(true),
		);
		const payload = {
			model: "high",
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
		const adapted = (await captured.beforeRequest?.(
			{ type: "before_provider_request", payload },
			context as never,
		)) as Record<string, unknown>;
		expect(adapted).not.toBe(payload);
		expect(adapted.input).toHaveLength(2);
		expect(adapted.client_metadata).toMatchObject({ "x-codex-turn-metadata": expect.any(String) });
		expect(ensureReady).toHaveBeenCalledWith("default");
		await expect(
			captured.beforeRequest?.({ type: "before_provider_request", payload }, {
				...context,
				model: { provider: "anthropic" },
			} as never),
		).resolves.toBe(payload);
		expect(ensureReady).toHaveBeenCalledOnce();
	});

	it("does not open login when auto-login is disabled", async () => {
		const captured: CapturedHandlers = { types: [] };
		const ensureReady = vi.fn(async () => {});
		const target = await account();
		await writeFile(join(target.configDir, "browser", "login-marker.json"), "{}\n");
		registerInternetHooks(
			captureHandlers(captured),
			{ ensureReady } as unknown as OwnedDaemonManager,
			[target],
			autoLogin(false),
		);
		const notify = vi.fn();
		const payload = { input: "sensitive user content" };
		const result = await captured.beforeRequest?.({ type: "before_provider_request", payload }, {
			model: { provider: "chatgpt-web" },
			hasUI: true,
			ui: { notify },
		} as never);
		expectRejectedRequest(result);
		expect(ensureReady).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("internet_daemon"), "warning");
	});

	it("fails closed when readiness or request adaptation fails", async () => {
		const captured: CapturedHandlers = { types: [] };
		const ensureReady = vi.fn<() => Promise<void>>(async () => {
			throw new Error("daemon unavailable");
		});
		registerInternetHooks(
			captureHandlers(captured),
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
			await captured.beforeRequest?.(
				{ type: "before_provider_request", payload: { input: "sensitive user content" } },
				context as never,
			),
		);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("request preparation failed"), "error");

		ensureReady.mockResolvedValueOnce(undefined);
		expectRejectedRequest(
			await captured.beforeRequest?.(
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
