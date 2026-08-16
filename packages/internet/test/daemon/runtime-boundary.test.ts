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

describe("runtime source boundary", () => {
	it("keeps adapter imports out of neutral modules", async () => {
		const files = (await readdir(runtimeSource)).filter((file) => file.endsWith(".ts") && file !== "cli.ts");
		const sources = await Promise.all(files.map((file) => readFile(join(runtimeSource, file), "utf8")));
		for (const source of sources) expect(source).not.toMatch(/from ["']\.\/adapters\/chatgpt-web/);
	});

	it("keeps provider protocol modules inside the ChatGPT adapter", async () => {
		for (const removed of ["bridge.ts", "login-state.ts", "types.ts", "responses"]) {
			expect(await exists(join(runtimeSource, removed))).toBe(false);
		}
		for (const current of ["server.ts", "config.ts", "responses/bridge.ts", "login-state.ts", "types.ts"]) {
			expect(await exists(join(runtimeSource, "adapters/chatgpt-web", current))).toBe(true);
		}
	});
});
