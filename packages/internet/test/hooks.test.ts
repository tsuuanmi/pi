import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	BeforeProviderRequestEvent,
	ExtensionHandler,
	SessionShutdownEvent,
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
	};
}

const autoLogin = (enabled: boolean) =>
	({
		get: vi.fn(async () => ({ autoLogin: enabled })),
	}) as unknown as InternetSettingsStore;

describe("registerInternetHooks", () => {
	it("blocks bridged tools and stops only owned daemons on shutdown", async () => {
		let toolCall: ExtensionHandler<ToolCallEvent, ToolCallEventResult> | undefined;
		let turnEnd: ExtensionHandler<TurnEndEvent> | undefined;
		let sessionShutdown: ExtensionHandler<SessionShutdownEvent> | undefined;
		const stopOwned = vi.fn(async () => {});
		registerInternetHooks(
			{
				on(event: "tool_call" | "turn_end" | "before_provider_request" | "session_shutdown", handler: unknown) {
					if (event === "tool_call") toolCall = handler as ExtensionHandler<ToolCallEvent, ToolCallEventResult>;
					else if (event === "turn_end") turnEnd = handler as ExtensionHandler<TurnEndEvent>;
					else if (event === "session_shutdown")
						sessionShutdown = handler as ExtensionHandler<SessionShutdownEvent>;
				},
			},
			{ stopOwned } as unknown as OwnedDaemonManager,
			[await account()],
			autoLogin(true),
		);
		const result = await toolCall?.({ type: "tool_call", toolCallId: "call", toolName: "codex_exec", input: {} }, {
			hasUI: false,
		} as never);
		expect(result).toMatchObject({ block: true });
		expect(turnEnd).toBeDefined();
		await sessionShutdown?.({ type: "session_shutdown", reason: "quit" }, {} as never);
		expect(stopOwned).toHaveBeenCalledOnce();
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
		const payload = { input: "test" };
		await expect(
			beforeRequest?.({ type: "before_provider_request", payload }, { model: { provider: "chatgpt-web" } } as never),
		).resolves.toBe(payload);
		expect(ensureReady).toHaveBeenCalledWith("default");
		await beforeRequest?.({ type: "before_provider_request", payload }, {
			model: { provider: "anthropic" },
		} as never);
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
		const payload = { input: "test" };
		await expect(
			beforeRequest?.({ type: "before_provider_request", payload }, {
				model: { provider: "chatgpt-web" },
				hasUI: true,
				ui: { notify },
			} as never),
		).resolves.toBe(payload);
		expect(ensureReady).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("internet_daemon"), "warning");
	});
});
