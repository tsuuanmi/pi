import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const codingAgentSrcIndex = fileURLToPath(new URL("../coding-agent/src/index.ts", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000,
	},
	resolve: {
		alias: [
			{ find: /^@tsuuanmi\/pi-coding-agent$/, replacement: codingAgentSrcIndex },
		],
	},
});