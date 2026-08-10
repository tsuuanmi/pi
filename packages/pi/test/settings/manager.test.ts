import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync as writeFile } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_HTTP_IDLE_TIMEOUT_MS } from "#pi/network/http-dispatcher";
import { SettingsManager } from "#pi/settings/manager";

function writeSettings(path: string, content: string): void {
	writeFile(path, content, { encoding: "utf8", mode: 0o600 });
	if (process.platform !== "win32") chmodSync(path, 0o600);
}

describe("SettingsManager", () => {
	const testDir = join(process.cwd(), "test-settings-tmp");
	const agentDir = join(testDir, "agent");
	const projectDir = join(testDir, "project");

	beforeEach(() => {
		// Clean up and create fresh directories
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(projectDir, ".pi"), { recursive: true });
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("preserves externally added settings", () => {
		it("should preserve enabledModels when changing thinking level", () => {
			// Create initial settings file
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(
				settingsPath,
				JSON.stringify({
					theme: "dark",
					defaultModel: "claude-sonnet",
				}),
			);

			// Create SettingsManager (simulates pi starting up)
			const manager = SettingsManager.create(projectDir, agentDir);

			// Simulate user editing settings.json externally to add enabledModels
			const currentSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			currentSettings.enabledModels = ["claude-opus-4-5", "gpt-5.2-codex"];
			writeSettings(settingsPath, JSON.stringify(currentSettings, null, 2));

			// User changes thinking level via Shift+Tab
			manager.setDefaultThinkingLevel("high");

			// Verify enabledModels is preserved
			const savedSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(savedSettings.enabledModels).toEqual(["claude-opus-4-5", "gpt-5.2-codex"]);
			expect(savedSettings.defaultThinkingLevel).toBe("high");
			expect(savedSettings.theme).toBe("dark");
			expect(savedSettings.defaultModel).toBe("claude-sonnet");
		});

		it("should preserve custom settings when changing theme", () => {
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(
				settingsPath,
				JSON.stringify({
					defaultModel: "claude-sonnet",
				}),
			);

			const manager = SettingsManager.create(projectDir, agentDir);

			// User adds custom settings externally
			const currentSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			currentSettings.shellPath = "/bin/zsh";
			currentSettings.extensions = ["/path/to/extension.ts"];
			writeSettings(settingsPath, JSON.stringify(currentSettings, null, 2));

			// User changes theme
			manager.setTheme("light");

			// Verify all settings preserved
			const savedSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(savedSettings.shellPath).toBe("/bin/zsh");
			expect(savedSettings.extensions).toEqual(["/path/to/extension.ts"]);
			expect(savedSettings.theme).toBe("light");
		});

		it("should let in-memory changes override file changes for same key", () => {
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(
				settingsPath,
				JSON.stringify({
					theme: "dark",
				}),
			);

			const manager = SettingsManager.create(projectDir, agentDir);

			// User externally sets thinking level to "low"
			const currentSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			currentSettings.defaultThinkingLevel = "low";
			writeSettings(settingsPath, JSON.stringify(currentSettings, null, 2));

			// But then changes it via UI to "high"
			manager.setDefaultThinkingLevel("high");

			// In-memory change should win
			const savedSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(savedSettings.defaultThinkingLevel).toBe("high");
		});
	});

	describe("packages", () => {
		it("should keep local-only extensions in extensions array", () => {
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(
				settingsPath,
				JSON.stringify({
					extensions: ["/local/ext.ts", "./relative/ext.ts"],
				}),
			);

			const manager = SettingsManager.create(projectDir, agentDir);

			expect(manager.getPackages()).toEqual([]);
			expect(manager.getExtensionPaths()).toEqual(["/local/ext.ts", "./relative/ext.ts"]);
		});

		it("should handle packages with filtering objects", () => {
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(
				settingsPath,
				JSON.stringify({
					packages: [
						"npm:simple-pkg",
						{
							source: "npm:shitty-extensions",
							extensions: ["extensions/oracle.ts"],
							skills: [],
						},
					],
				}),
			);

			const manager = SettingsManager.create(projectDir, agentDir);

			const packages = manager.getPackages();
			expect(packages).toHaveLength(2);
			expect(packages[0]).toBe("npm:simple-pkg");
			expect(packages[1]).toEqual({
				source: "npm:shitty-extensions",
				extensions: ["extensions/oracle.ts"],
				skills: [],
			});
		});
	});

	describe("reload", () => {
		it("should reload global settings from disk", () => {
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(
				settingsPath,
				JSON.stringify({
					theme: "dark",
					extensions: ["/before.ts"],
				}),
			);

			const manager = SettingsManager.create(projectDir, agentDir);

			writeSettings(
				settingsPath,
				JSON.stringify({
					theme: "light",
					extensions: ["/after.ts"],
					defaultModel: "claude-sonnet",
				}),
			);

			manager.reload();

			expect(manager.getTheme()).toBe("light");
			expect(manager.getExtensionPaths()).toEqual(["/after.ts"]);
			expect(manager.getDefaultModel()).toBe("claude-sonnet");
		});

		it("rejects invalid reloads without changing active settings", () => {
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(settingsPath, JSON.stringify({ theme: "dark" }));

			const manager = SettingsManager.create(projectDir, agentDir);

			writeSettings(settingsPath, "{ invalid json");
			expect(() => manager.reload()).toThrow("global settings: is not valid JSON");
			expect(manager.getTheme()).toBe("dark");
		});
	});

	describe("invalid files", () => {
		it.each([
			["global", () => join(agentDir, "settings.json")],
			["project", () => join(projectDir, ".pi", "settings.json")],
		] as const)("rejects invalid %s settings during creation", (scope, settingsPath) => {
			writeSettings(settingsPath(), "{ invalid json");
			expect(() => SettingsManager.create(projectDir, agentDir)).toThrow(`${scope} settings: is not valid JSON`);
		});
	});

	describe("project settings directory creation", () => {
		it("should not create .pi folder when only reading project settings", () => {
			// Create agent dir with global settings, but NO .pi folder in project
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(settingsPath, JSON.stringify({ theme: "dark" }));

			// Delete the .pi folder that beforeEach created
			rmSync(join(projectDir, ".pi"), { recursive: true });

			// Create SettingsManager (reads both global and project settings)
			const manager = SettingsManager.create(projectDir, agentDir);

			// .pi folder should NOT have been created just from reading
			expect(existsSync(join(projectDir, ".pi"))).toBe(false);

			// Settings should still be loaded from global
			expect(manager.getTheme()).toBe("dark");
		});

		it("should create .pi folder when writing project settings", () => {
			// Create agent dir with global settings, but NO .pi folder in project
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(settingsPath, JSON.stringify({ theme: "dark" }));

			// Delete the .pi folder that beforeEach created
			rmSync(join(projectDir, ".pi"), { recursive: true });

			const manager = SettingsManager.create(projectDir, agentDir);

			// .pi folder should NOT exist yet
			expect(existsSync(join(projectDir, ".pi"))).toBe(false);

			// Write a project-specific setting
			manager.setProjectPackages([{ source: "npm:test-pkg" }]);

			// Now .pi folder should exist
			expect(existsSync(join(projectDir, ".pi"))).toBe(true);

			// And settings file should be created
			expect(existsSync(join(projectDir, ".pi", "settings.json"))).toBe(true);
		});
	});

	describe("httpIdleTimeoutMs", () => {
		it("should default to 5 minutes", () => {
			const manager = SettingsManager.create(projectDir, agentDir);
			expect(manager.getHttpIdleTimeoutMs()).toBe(DEFAULT_HTTP_IDLE_TIMEOUT_MS);
		});

		it("should use merged global and project settings", () => {
			writeSettings(join(agentDir, "settings.json"), JSON.stringify({ httpIdleTimeoutMs: 300000 }));
			writeSettings(join(projectDir, ".pi", "settings.json"), JSON.stringify({ httpIdleTimeoutMs: 0 }));

			const manager = SettingsManager.create(projectDir, agentDir);

			expect(manager.getHttpIdleTimeoutMs()).toBe(0);
		});

		it("should reject invalid timeout values", () => {
			writeSettings(join(agentDir, "settings.json"), JSON.stringify({ httpIdleTimeoutMs: -1 }));
			expect(() => SettingsManager.create(projectDir, agentDir)).toThrow(
				"global settings.httpIdleTimeoutMs: must be a non-negative number",
			);
		});
	});

	describe("shellCommandPrefix", () => {
		it("should load shellCommandPrefix from settings", () => {
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(settingsPath, JSON.stringify({ shellCommandPrefix: "shopt -s expand_aliases" }));

			const manager = SettingsManager.create(projectDir, agentDir);

			expect(manager.getShellCommandPrefix()).toBe("shopt -s expand_aliases");
		});

		it("should return undefined when shellCommandPrefix is not set", () => {
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(settingsPath, JSON.stringify({ theme: "dark" }));

			const manager = SettingsManager.create(projectDir, agentDir);

			expect(manager.getShellCommandPrefix()).toBeUndefined();
		});

		it("should preserve shellCommandPrefix when saving unrelated settings", () => {
			const settingsPath = join(agentDir, "settings.json");
			writeSettings(settingsPath, JSON.stringify({ shellCommandPrefix: "shopt -s expand_aliases" }));

			const manager = SettingsManager.create(projectDir, agentDir);
			manager.setTheme("light");

			const savedSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(savedSettings.shellCommandPrefix).toBe("shopt -s expand_aliases");
			expect(savedSettings.theme).toBe("light");
		});
	});

	describe("retainedContext", () => {
		it("should default retained context Tier 2 settings", () => {
			const manager = SettingsManager.create(projectDir, agentDir);

			expect(manager.getRetainedContextSettings()).toEqual({
				stripThinking: true,
				compressBashOutput: true,
				bashMaxBytes: 16_384,
				dedupeReadResults: true,
				summarizeStaleToolResults: true,
				toolResultMaxBytes: 96_000,
			});
		});

		it("should load retained context Tier 2 opt-outs and budget", () => {
			writeSettings(
				join(agentDir, "settings.json"),
				JSON.stringify({
					retainedContext: {
						stripThinking: false,
						compressBashOutput: false,
						bashMaxBytes: 2048,
						dedupeReadResults: false,
						summarizeStaleToolResults: false,
						toolResultMaxBytes: 64000,
					},
				}),
			);
			const manager = SettingsManager.create(projectDir, agentDir);

			expect(manager.getRetainedContextSettings()).toEqual({
				stripThinking: false,
				compressBashOutput: false,
				bashMaxBytes: 2048,
				dedupeReadResults: false,
				summarizeStaleToolResults: false,
				toolResultMaxBytes: 64000,
			});
		});

		it("should reject invalid retained context byte budgets", () => {
			writeSettings(
				join(agentDir, "settings.json"),
				JSON.stringify({ retainedContext: { bashMaxBytes: -1, toolResultMaxBytes: Number.POSITIVE_INFINITY } }),
			);
			expect(() => SettingsManager.create(projectDir, agentDir)).toThrow(
				"global settings.retainedContext.bashMaxBytes: must be a non-negative number",
			);
		});
	});

	describe("getSessionDir", () => {
		it("should return undefined when not set", () => {
			writeSettings(join(agentDir, "settings.json"), JSON.stringify({ theme: "dark" }));
			const manager = SettingsManager.create(projectDir, agentDir);
			expect(manager.getSessionDir()).toBeUndefined();
		});

		it("should return global sessionDir", () => {
			writeSettings(join(agentDir, "settings.json"), JSON.stringify({ sessionDir: "/tmp/sessions" }));
			const manager = SettingsManager.create(projectDir, agentDir);
			expect(manager.getSessionDir()).toBe("/tmp/sessions");
		});

		it("should return project sessionDir, overriding global", () => {
			writeSettings(join(agentDir, "settings.json"), JSON.stringify({ sessionDir: "/global/sessions" }));
			writeSettings(join(projectDir, ".pi", "settings.json"), JSON.stringify({ sessionDir: "./sessions" }));
			const manager = SettingsManager.create(projectDir, agentDir);
			expect(manager.getSessionDir()).toBe("./sessions");
		});

		it("should expand ~ in sessionDir", () => {
			writeSettings(join(agentDir, "settings.json"), JSON.stringify({ sessionDir: "~/sessions" }));
			const manager = SettingsManager.create(projectDir, agentDir);
			expect(manager.getSessionDir()).toBe(join(homedir(), "sessions"));
		});
	});
});
