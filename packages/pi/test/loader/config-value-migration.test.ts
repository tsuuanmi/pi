import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStorage } from "#pi/auth/storage";
import { ModelRegistry } from "#pi/loader/model-registry";
import type { ModelsSettings } from "#pi/settings/types";

describe("config value env var syntax migration", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function createAgentDir(): string {
		const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-config-value-migration-test-"));
		tempDirs.push(agentDir);
		return agentDir;
	}

	it("leaves uppercase provider API key and header values unchanged", async () => {
		const agentDir = createAgentDir();
		const envKeys = ["CUSTOM_API_KEY", "HEADER_API_KEY", "MODEL_API_KEY", "OVERRIDE_API_KEY"];
		const savedEnv: Record<string, string | undefined> = {};
		for (const key of envKeys) {
			savedEnv[key] = process.env[key];
			process.env[key] = `env-${key}`;
		}

		try {
			const modelsConfig = {
				providers: {
					"custom-provider": {
						baseUrl: "https://example.com/v1",
						apiKey: "CUSTOM_API_KEY",
						api: "openai-completions",
						headers: {
							"x-api-key": "HEADER_API_KEY",
							"x-literal": "literal",
						},
						models: [
							{
								id: "model-a",
								headers: { "x-model-key": "MODEL_API_KEY" },
							},
						],
						modelOverrides: {
							"model-b": { headers: { "x-override-key": "OVERRIDE_API_KEY" } },
						},
					},
				},
			} as ModelsSettings;

			const registry = ModelRegistry.createFromModelsConfig(
				AuthStorage.create(path.join(agentDir, "auth.json")),
				modelsConfig,
			);
			const model = registry.find("custom-provider", "model-a");
			expect(model).toBeDefined();
			expect(await registry.getApiKeyForProvider("custom-provider")).toBe("CUSTOM_API_KEY");
			expect(await registry.getApiKeyAndHeaders(model!)).toMatchObject({
				ok: true,
				apiKey: "CUSTOM_API_KEY",
				headers: {
					"x-api-key": "HEADER_API_KEY",
					"x-literal": "literal",
					"x-model-key": "MODEL_API_KEY",
				},
			});
		} finally {
			for (const key of envKeys) {
				if (savedEnv[key] === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = savedEnv[key];
				}
			}
		}
	});
});
