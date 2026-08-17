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
		expect(accounts).toMatchObject([{ id: "default", provider: "openai", host: "127.0.0.1", port: 17841 }]);
	});

	it("stores browser and API accounts in the authoritative schema", async () => {
		const target = await registry();
		await target.add({ id: "work", provider: "openai", port: 18001 });
		await target.add({ id: "research", provider: "anthropic", apiKeyEnv: "ANTHROPIC_RESEARCH_KEY" });
		await target.add({ id: "gemini", provider: "gemini-web", port: 18002 });
		const accounts = await target.list();
		expect(accounts).toMatchObject([
			{ id: "default", provider: "openai" },
			{ id: "work", provider: "openai", port: 18001 },
			{ id: "research", provider: "anthropic", apiKeyEnv: "ANTHROPIC_RESEARCH_KEY" },
			{ id: "gemini", provider: "gemini-web", port: 18002 },
		]);
		expect(JSON.parse(await readFile(target.path, "utf8"))).not.toHaveProperty("schemaVersion");
		expect((await stat(target.path)).mode & 0o777).toBe(0o600);
	});

	it("removes routing metadata without recreating defaults", async () => {
		const target = await registry();
		await target.remove("default");
		await expect(target.list()).resolves.toEqual([]);
	});

	it("rejects versioned registries and duplicate daemon endpoints", async () => {
		const target = await registry();
		await writeFile(target.path, JSON.stringify({ schemaVersion: 2, accounts: [] }));
		await expect(target.list()).rejects.toThrow("unsupported fields");

		const next = await registry();
		await expect(next.add({ id: "collision", provider: "openai", port: 17841 })).rejects.toThrow(
			"Duplicate daemon endpoint",
		);
		await expect(
			next.add({ id: "gemini", provider: "gemini-web", configDir: "/tmp/gemini", host: "127.0.0.1", port: 18041 }),
		).resolves.toMatchObject({
			provider: "gemini-web",
		});
	});
});
