import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionToolSpec, ProviderConfig } from "@tsuuanmi/pi/extensions";
import { OwnedDaemonManager } from "#internet/daemon/manager";
import internetExtension from "#internet/extension";

describe("internetExtension", () => {
	it("registers the provider, tools, hooks, and HUD", async () => {
		const previous = process.env.PI_AGENT_DIR;
		process.env.PI_AGENT_DIR = await mkdtemp(join(tmpdir(), "pi-internet-extension-"));
		const providers: string[] = [];
		const tools: string[] = [];
		const hooks: string[] = [];
		const hud = vi.fn();
		const autoStart = vi.spyOn(OwnedDaemonManager.prototype, "autoStart").mockResolvedValue();
		try {
			await internetExtension({
				registerProvider: (name: string, _config: ProviderConfig) => providers.push(name),
				registerTool: (tool: ExtensionToolSpec) => tools.push(tool.name),
				on: (event: string) => hooks.push(event),
				registerHudProvider: hud,
			} as unknown as ExtensionAPI);
			expect(providers).toEqual(["chatgpt-web"]);
			expect(tools).toEqual([
				"internet_accounts",
				"internet_account_add",
				"internet_account_set_enabled",
				"internet_status",
				"internet_control",
				"internet_compact",
				"internet_daemon",
				"internet_settings",
				"internet_search",
				"internet_fetch",
			]);
			expect(hooks).toEqual(["tool_call", "before_provider_request", "turn_end", "session_shutdown"]);
			expect(autoStart).toHaveBeenCalledOnce();
			expect(hud).toHaveBeenCalledOnce();
		} finally {
			if (previous === undefined) delete process.env.PI_AGENT_DIR;
			else process.env.PI_AGENT_DIR = previous;
		}
	});
});
