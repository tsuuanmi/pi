import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const piSrcIndex = fileURLToPath(new URL("../pi/src/index.ts", import.meta.url));
const orchestratorSrcIndex = fileURLToPath(new URL("../orchestrator/src/index.ts", import.meta.url));
const workflowsTestRoot = fileURLToPath(new URL("./test", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000,
	},
	resolve: {
		alias: [
			{ find: /^@tsuuanmi\/pi$/, replacement: piSrcIndex },
			{ find: /^@tsuuanmi\/pi-orchestrator$/, replacement: orchestratorSrcIndex },
			{ find: /^#workflows-test\/(.*)$/, replacement: `${workflowsTestRoot}/$1` },
		],
	},
});