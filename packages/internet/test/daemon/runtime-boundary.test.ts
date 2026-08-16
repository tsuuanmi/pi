import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeSource = fileURLToPath(new URL("../../runtime/src/", import.meta.url));

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
	it("keeps browser and provider imports out of core modules", async () => {
		const files = await sourceFiles(join(runtimeSource, "core"));
		const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
		for (const source of sources) {
			expect(source).not.toMatch(/(?:from|import\s*\()\s*["'][^"']*(?:browser|providers\/chatgpt-web)/);
		}
	});

	it("keeps provider details out of reusable browser modules", async () => {
		const files = ["session.ts", "turn.ts", "response-capture.ts"].map((file) =>
			join(runtimeSource, "browser", file),
		);
		const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
		for (const source of sources) {
			expect(source).not.toMatch(/providers\/chatgpt-web|chatgpt|openai|backend-api|data-testid/i);
		}
	});

	it("keeps provider protocol modules inside the ChatGPT provider", async () => {
		for (const removed of [
			"bridge.ts",
			"login-state.ts",
			"types.ts",
			"responses",
			"config.ts",
			"server.ts",
			"providers/chatgpt-web/browser",
			"providers/chatgpt-web/transport/wire-capture.ts",
		]) {
			expect(await exists(join(runtimeSource, removed))).toBe(false);
		}
		for (const current of [
			"core/config.ts",
			"core/server.ts",
			"browser/session.ts",
			"browser/response-capture.ts",
			"providers/chatgpt-web/lifecycle/config.ts",
			"providers/chatgpt-web/server/routes.ts",
			"providers/chatgpt-web/protocol/types.ts",
			"providers/chatgpt-web/protocol/responses/bridge.ts",
			"browser/chatgpt-web/login-state.ts",
			"browser/chatgpt-web/worker.ts",
			"browser/chatgpt-web/wire-capture.ts",
			"providers/chatgpt-web/transport/wire-response.ts",
		]) {
			expect(await exists(join(runtimeSource, current))).toBe(true);
		}
	});
});
