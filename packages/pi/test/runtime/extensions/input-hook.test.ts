import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "#pi/auth/storage";
import { discoverAndLoadExtensions } from "#pi/loader/extensions/loader";
import { ModelRegistry } from "#pi/loader/model-registry";
import { ExtensionRunner } from "#pi/runtime/extensions/runner";
import { SessionManager } from "#pi/session/manager";
import { SettingsManager } from "#pi/settings/manager";
import { createTestResourceLoader } from "#pi-test/helpers/resource-loader";
import { createTestAgentSessionServices } from "#pi-test/helpers/services";

describe("Input Hook", () => {
	let tempDir: string;
	let extensionsDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-input-test-"));
		extensionsDir = path.join(tempDir, "extensions");
		fs.mkdirSync(extensionsDir);
		// Clean globalThis test vars
		delete (globalThis as any).testVar;
	});

	afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

	async function createRunner(...extensions: string[]) {
		// Clear and recreate extensions dir for clean state
		fs.rmSync(extensionsDir, { recursive: true, force: true });
		fs.mkdirSync(extensionsDir);
		for (let i = 0; i < extensions.length; i++) fs.writeFileSync(path.join(extensionsDir, `e${i}.ts`), extensions[i]);
		const result = await discoverAndLoadExtensions([], tempDir, tempDir);
		const sm = SessionManager.inMemory();
		const mr = ModelRegistry.create(AuthStorage.create(path.join(tempDir, "auth.json")));
		const services = createTestAgentSessionServices({
			cwd: tempDir,
			modelRegistry: mr,
			resourceLoader: createTestResourceLoader(),
			settingsManager: SettingsManager.create(tempDir, tempDir),
		});
		return new ExtensionRunner(result.extensions, result.runtime, tempDir, sm, mr, services);
	}

	it("returns continue when no hooks, undefined return, or explicit continue", async () => {
		// No handlers
		expect((await (await createRunner()).runInputHook("x", "interactive")).action).toBe("continue");
		// Returns undefined
		let r = await createRunner(`export default p => p.onHook("input", async () => {});`);
		expect((await r.runInputHook("x", "interactive")).action).toBe("continue");
		// Returns explicit continue
		r = await createRunner(`export default p => p.onHook("input", async () => ({ action: "continue" }));`);
		expect((await r.runInputHook("x", "interactive")).action).toBe("continue");
	});

	it("transforms text", async () => {
		const r = await createRunner(
			`export default p => p.onHook("input", async e => ({ action: "transform", text: "T:" + e.text }));`,
		);
		const result = await r.runInputHook("hi", "interactive");
		expect(result).toEqual({ action: "transform", text: "T:hi" });
	});

	it("chains transforms across multiple hooks", async () => {
		const r = await createRunner(
			`export default p => p.onHook("input", async e => ({ action: "transform", text: e.text + "[1]" }));`,
			`export default p => p.onHook("input", async e => ({ action: "transform", text: e.text + "[2]" }));`,
		);
		const result = await r.runInputHook("X", "interactive");
		expect(result).toEqual({ action: "transform", text: "X[1][2]" });
	});

	it("short-circuits on handled and skips subsequent hooks", async () => {
		(globalThis as any).testVar = false;
		const r = await createRunner(
			`export default p => p.onHook("input", async () => ({ action: "handled" }));`,
			`export default p => p.onHook("input", async () => { globalThis.testVar = true; });`,
		);
		expect(await r.runInputHook("X", "interactive")).toEqual({ action: "handled" });
		expect((globalThis as any).testVar).toBe(false);
	});

	it("passes source correctly for all source types", async () => {
		const r = await createRunner(
			`export default p => p.onHook("input", async e => { globalThis.testVar = e.source; return { action: "continue" }; });`,
		);
		for (const source of ["interactive", "rpc", "extension"] as const) {
			await r.runInputHook("x", source);
			expect((globalThis as any).testVar).toBe(source);
		}
	});

	it("passes streamingBehavior correctly", async () => {
		const r = await createRunner(
			`export default p => p.onHook("input", async e => { globalThis.testVar = e.streamingBehavior; return { action: "continue" }; });`,
		);
		await r.runInputHook("x", "interactive", "steer");
		expect((globalThis as any).testVar).toBe("steer");
		await r.runInputHook("x", "interactive", "followUp");
		expect((globalThis as any).testVar).toBe("followUp");
		await r.runInputHook("x", "interactive");
		expect((globalThis as any).testVar).toBeUndefined();
	});

	it("catches hook errors and continues", async () => {
		const r = await createRunner(`export default p => p.onHook("input", async () => { throw new Error("boom"); });`);
		const errs: string[] = [];
		r.onError((e) => errs.push(e.error));
		const result = await r.runInputHook("x", "interactive");
		expect(result.action).toBe("continue");
		expect(errs).toContain("boom");
	});

	it("reports registered hook handlers", async () => {
		let r = await createRunner();
		expect(r.hasHookHandlers("input")).toBe(false);
		r = await createRunner(`export default p => p.onHook("input", async () => {});`);
		expect(r.hasHookHandlers("input")).toBe(true);
	});
});
