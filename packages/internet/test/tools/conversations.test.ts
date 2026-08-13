import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerConversationTool } from "#internet/tools/conversations";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet_conversation", () => {
	it("reports mode and authority without starting the daemon", async () => {
		const previous = process.env.PI_AGENT_DIR;
		const agentDir = await mkdtemp(join(tmpdir(), "pi-internet-conversation-tool-"));
		process.env.PI_AGENT_DIR = agentDir;
		try {
			const stateDir = join(agentDir, "internet", "accounts", "default", "conversations");
			await mkdir(stateDir, { recursive: true });
			await writeFile(join(stateDir, "authority.json"), "{}\n");
			const manager = { stop: vi.fn(), ensureReady: vi.fn() } as any;
			const tool = captureTools((host) => registerConversationTool(host, manager)).get("internet_conversation");
			const result = await tool?.execute("status", { action: "status" }, undefined, undefined, {} as never);
			expect(result?.details).toEqual({ account: "default", mode: "temporary", authority: true, action: "status" });
			expect(manager.ensureReady).not.toHaveBeenCalled();
		} finally {
			if (previous === undefined) delete process.env.PI_AGENT_DIR;
			else process.env.PI_AGENT_DIR = previous;
		}
	});

	it("requires confirmation and stops the daemon before reset", async () => {
		const previous = process.env.PI_AGENT_DIR;
		process.env.PI_AGENT_DIR = await mkdtemp(join(tmpdir(), "pi-internet-conversation-reset-"));
		try {
			const manager = { stop: vi.fn(async () => {}) } as any;
			const tool = captureTools((host) => registerConversationTool(host, manager)).get("internet_conversation");
			await expect(tool?.execute("reset", { action: "reset" }, undefined, undefined, {} as never)).rejects.toThrow(
				"confirm=true",
			);
			await tool?.execute("reset", { action: "reset", confirm: true }, undefined, undefined, {} as never);
			expect(manager.stop).toHaveBeenCalledWith("default");
		} finally {
			if (previous === undefined) delete process.env.PI_AGENT_DIR;
			else process.env.PI_AGENT_DIR = previous;
		}
	});
});
