import type { ServerConfig } from "#pi/lsp/runtime/types";

export const DEFAULT_LSP_SERVERS: Record<string, ServerConfig> = {
	"typescript-language-server": {
		command: "typescript-language-server",
		args: ["--stdio"],
		fileTypes: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
		rootMarkers: ["package.json", "tsconfig.json", "jsconfig.json"],
	},
	"rust-analyzer": {
		command: "rust-analyzer",
		fileTypes: [".rs"],
		rootMarkers: ["Cargo.toml", "rust-analyzer.toml"],
	},
	pyright: {
		command: "pyright-langserver",
		args: ["--stdio"],
		fileTypes: [".py"],
		rootMarkers: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile", ".git"],
		languageId: "python",
	},
};
