import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerAccountsTools } from "#internet/tools/accounts";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet account tools", () => {
	it("registers list, add, enable, and conversation-mode tools", () => {
		const tools = captureTools(registerAccountsTools);
		expect([...tools.keys()]).toEqual([
			"internet_accounts",
			"internet_account_add",
			"internet_account_set_enabled",
			"internet_account_conversation_mode",
		]);
	});

	it("adds an account to the configured registry", async () => {
		const previous = process.env.PI_AGENT_DIR;
		process.env.PI_AGENT_DIR = await mkdtemp(join(tmpdir(), "pi-internet-tools-"));
		try {
			const tool = captureTools(registerAccountsTools).get("internet_account_add");
			const result = await tool?.execute(
				"call",
				{ id: "work", configDir: "/tmp/work", port: 18001 },
				undefined,
				undefined,
				{} as never,
			);
			expect(result?.details).toMatchObject({ id: "work", port: 18001 });
		} finally {
			if (previous === undefined) delete process.env.PI_AGENT_DIR;
			else process.env.PI_AGENT_DIR = previous;
		}
	});

	it("sets explicit durable mode without changing the default", async () => {
		const previous = process.env.PI_AGENT_DIR;
		process.env.PI_AGENT_DIR = await mkdtemp(join(tmpdir(), "pi-internet-mode-tools-"));
		try {
			const tools = captureTools(registerAccountsTools);
			await tools
				.get("internet_account_add")
				?.execute(
					"add",
					{ id: "research", configDir: "/tmp/research", port: 18002 },
					undefined,
					undefined,
					{} as never,
				);
			const result = await tools
				.get("internet_account_conversation_mode")
				?.execute("mode", { id: "research", mode: "durable" }, undefined, undefined, {} as never);
			expect(result?.details).toMatchObject({ id: "research", conversationMode: "durable" });
		} finally {
			if (previous === undefined) delete process.env.PI_AGENT_DIR;
			else process.env.PI_AGENT_DIR = previous;
		}
	});
});
