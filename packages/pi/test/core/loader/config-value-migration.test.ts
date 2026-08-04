import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStorage } from "#pi/auth/storage";
import { ENV_AGENT_DIR } from "#pi/loader/config";
import { ModelRegistry } from "#pi/loader/model-registry";
import { runMigrations } from "#pi/migrations";
import type { ModelsSettings } from "#pi/settings/settings-manager";

describe("config value env var syntax migration", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		vi.restoreAllMocks();
	});

	function createAgentDir(): string {
		const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-config-value-migration-test-"));
		tempDirs.push(agentDir);
		return agentDir;
	}

	function withAgentDir(agentDir: string, fn: () => void): void {
		const previousAgentDir = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = agentDir;
		try {
			fn();
		} finally {
			if (previousAgentDir === undefined) {
				delete process.env[ENV_AGENT_DIR];
			} else {
				process.env[ENV_AGENT_DIR] = previousAgentDir;
			}
		}
	}

	it("leaves uppercase auth.json API key values unchanged", () => {
		const agentDir = createAgentDir();
		fs.writeFileSync(
			path.join(agentDir, "auth.json"),
			`${JSON.stringify(
				{
					anthropic: { type: "api_key", key: "ANTHROPIC_API_KEY" },
					openai: { type: "api_key", key: "$OPENAI_API_KEY" },
					"custom-provider": { type: "api_key", key: "public" },
					github: { type: "oauth", access: "ACCESS_TOKEN", refresh: "REFRESH_TOKEN", expires: 1 },
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		withAgentDir(agentDir, () => runMigrations(agentDir));

		const migrated = JSON.parse(fs.readFileSync(path.join(agentDir, "auth.json"), "utf-8")) as Record<
			string,
			Record<string, unknown>
		>;
		expect(migrated.anthropic.key).toBe("ANTHROPIC_API_KEY");
		expect(migrated.openai.key).toBe("$OPENAI_API_KEY");
		expect(migrated["custom-provider"].key).toBe("public");
		expect(migrated.github.access).toBe("ACCESS_TOKEN");
		expect(logSpy).not.toHaveBeenCalled();
	});

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
