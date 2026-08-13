import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountRegistry } from "#internet/accounts/registry";

function registry(): Promise<{ registry: AccountRegistry; path: string }> {
	return mkdtemp(join(tmpdir(), "pi-internet-registry-")).then((directory) => {
		const path = join(directory, "accounts.json");
		return { registry: new AccountRegistry({ path }), path };
	});
}

describe("AccountRegistry", () => {
	it("persists account changes atomically with private permissions", async () => {
		const test = await registry();
		await test.registry.add({ id: "Work", configDir: "/tmp/work", port: 18001 });
		await test.registry.setEnabled("work", false);
		const account = (await test.registry.list()).find((item) => item.id === "work");
		expect(account?.enabled).toBe(false);
		expect(account?.conversationMode).toBe("temporary");
		expect((await stat(test.path)).mode & 0o777).toBe(0o600);
	});

	it("rejects duplicate ids and endpoints", async () => {
		const test = await registry();
		await test.registry.add({ id: "work", configDir: "/tmp/work", port: 18_001 });
		await expect(test.registry.add({ id: "work", configDir: "/tmp/work-2", port: 18_002 })).rejects.toThrow(
			"already exists",
		);
		await expect(test.registry.add({ id: "other", configDir: "/tmp/other", port: 18_001 })).rejects.toThrow(
			"Duplicate internet account endpoint",
		);
	});

	it("persists explicit durable conversation mode", async () => {
		const test = await registry();
		const account = await test.registry.add({
			id: "research",
			configDir: "/tmp/research",
			port: 18_003,
			conversationMode: "durable",
		});
		expect(account.conversationMode).toBe("durable");
		expect((await test.registry.get("research")).conversationMode).toBe("durable");
	});

	it("accepts only the package-owned IPv4 loopback host", async () => {
		const test = await registry();
		await expect(test.registry.add({ id: "work", configDir: "/tmp/work", host: "localhost" })).rejects.toThrow(
			"must be 127.0.0.1",
		);
	});
});
