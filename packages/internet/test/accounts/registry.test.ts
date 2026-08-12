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
		expect((await stat(test.path)).mode & 0o777).toBe(0o600);
	});

	it("rejects duplicate ids", async () => {
		const test = await registry();
		await test.registry.add({ id: "work", configDir: "/tmp/work" });
		await expect(test.registry.add({ id: "work", configDir: "/tmp/work-2" })).rejects.toThrow("already exists");
	});
});
