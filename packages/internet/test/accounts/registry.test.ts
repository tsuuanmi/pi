import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountRegistry } from "#internet/accounts/registry";

async function registry(): Promise<AccountRegistry> {
	return new AccountRegistry(join(await mkdtemp(join(tmpdir(), "pi-internet-accounts-")), "accounts.json"));
}

describe("AccountRegistry", () => {
	it("provides one isolated default ChatGPT Web account", async () => {
		const accounts = await (await registry()).list();
		expect(accounts).toMatchObject([
			{ id: "default", backend: "openai", host: "127.0.0.1", port: 17841, conversationMode: "temporary" },
		]);
	});

	it("stores browser and API accounts in the authoritative schema", async () => {
		const target = await registry();
		await target.add({ id: "work", backend: "openai", port: 18001, conversationMode: "durable" });
		await target.add({ id: "research", backend: "anthropic", apiKeyEnv: "ANTHROPIC_RESEARCH_KEY" });
		const accounts = await target.list();
		expect(accounts).toMatchObject([
			{ id: "default", backend: "openai" },
			{ id: "work", backend: "openai", port: 18001, conversationMode: "durable" },
			{ id: "research", backend: "anthropic", apiKeyEnv: "ANTHROPIC_RESEARCH_KEY" },
		]);
		expect(JSON.parse(await readFile(target.path, "utf8"))).toMatchObject({ schemaVersion: 2 });
		expect((await stat(target.path)).mode & 0o777).toBe(0o600);
	});

	it("removes routing metadata without recreating defaults", async () => {
		const target = await registry();
		await target.remove("default");
		await expect(target.list()).resolves.toEqual([]);
	});

	it("rejects legacy schemas and duplicate daemon endpoints", async () => {
		const target = await registry();
		await writeFile(target.path, JSON.stringify({ schemaVersion: 1, accounts: [] }));
		await expect(target.list()).rejects.toThrow("schema version");

		const next = await registry();
		await expect(next.add({ id: "collision", backend: "openai", port: 17841 })).rejects.toThrow(
			"Duplicate daemon endpoint",
		);
	});
});
