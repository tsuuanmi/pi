import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeSource = fileURLToPath(new URL("../../vendor/runtime/src/", import.meta.url));

async function exists(path: string): Promise<boolean> {
	return stat(path).then(
		() => true,
		() => false,
	);
}

async function sourceFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
		else if (entry.name.endsWith(".ts")) files.push(path);
	}
	return files;
}

describe("runtime source boundary", () => {
	it("keeps adapter imports out of core modules", async () => {
		const files = await sourceFiles(join(runtimeSource, "core"));
		const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
		for (const source of sources) expect(source).not.toMatch(/adapters\/chatgpt-web/);
	});

	it("keeps provider protocol modules inside the ChatGPT adapter", async () => {
		for (const removed of ["bridge.ts", "login-state.ts", "types.ts", "responses", "config.ts", "server.ts"]) {
			expect(await exists(join(runtimeSource, removed))).toBe(false);
		}
		for (const current of [
			"core/config.ts",
			"core/server.ts",
			"adapters/chatgpt-web/lifecycle/config.ts",
			"adapters/chatgpt-web/server/routes.ts",
			"adapters/chatgpt-web/protocol/types.ts",
			"adapters/chatgpt-web/protocol/responses/bridge.ts",
			"adapters/chatgpt-web/browser/login-state.ts",
			"adapters/chatgpt-web/transport/wire-response.ts",
		]) {
			expect(await exists(join(runtimeSource, current))).toBe(true);
		}
	});
});
