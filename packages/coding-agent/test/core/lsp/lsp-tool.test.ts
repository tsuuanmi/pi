import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLspTool } from "../../../src/core/lsp/lsp-tool.ts";

async function makeLspProject(): Promise<string> {
	const dir = join(tmpdir(), `pi-lsp-tool-${process.pid}-${Date.now()}`);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "package.json"), JSON.stringify({ type: "module" }), "utf-8");
	await writeFile(join(dir, "pyproject.toml"), '[project]\nname = "pi-lsp-smoke"\nversion = "0.0.0"\n', "utf-8");
	await writeFile(
		join(dir, "index.ts"),
		`export function add(a: number, b: number): number {\n\treturn a + b;\n}\n\nexport const total = add(1, 2);\n`,
		"utf-8",
	);
	await writeFile(join(dir, "main.py"), "def greet(name: str) -> str:\n    return f'hello {name}'\n", "utf-8");
	return dir;
}

describe("lsp tool", () => {
	it("reports bundled TypeScript and Python LSP status and document symbols", async () => {
		const cwd = await makeLspProject();
		try {
			const tool = createLspTool(cwd);
			const status = await tool.execute("status", { action: "status" });
			const statusContent = status.content[0];
			expect(statusContent?.type).toBe("text");
			if (statusContent?.type !== "text") throw new Error("Expected text status content");
			expect(statusContent.text).toContain("typescript-language-server: available");
			expect(statusContent.text).toContain("pyright: available");
			expect(statusContent.text).toContain("rust-analyzer:");

			const symbols = await tool.execute("symbols", { action: "symbols", file: "index.ts", timeout: 20 });
			const symbolsContent = symbols.content[0];
			expect(symbolsContent?.type).toBe("text");
			if (symbolsContent?.type !== "text") throw new Error("Expected text symbols content");
			expect(symbolsContent.text).toContain("Function add");
			expect(symbolsContent.text).toContain("Constant total");
			expect(symbols.details.serverName).toBe("typescript-language-server");

			const pythonSymbols = await tool.execute("symbols", { action: "symbols", file: "main.py", timeout: 20 });
			const pythonSymbolsContent = pythonSymbols.content[0];
			expect(pythonSymbolsContent?.type).toBe("text");
			if (pythonSymbolsContent?.type !== "text") throw new Error("Expected text Python symbols content");
			expect(pythonSymbolsContent.text).toContain("Function greet");
			expect(pythonSymbols.details.serverName).toBe("pyright");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
