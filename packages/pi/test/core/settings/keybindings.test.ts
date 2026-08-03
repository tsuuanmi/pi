import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KeybindingsManager } from "#pi/settings/keybindings";

describe("keybindings", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function createAgentDir(config: Record<string, unknown>): string {
		const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-keybindings-test-"));
		tempDirs.push(agentDir);
		fs.writeFileSync(path.join(agentDir, "keybindings.json"), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
		return agentDir;
	}

	it("loads namespaced keybinding ids", () => {
		const config = {
			"tui.editor.cursorUp": ["up", "ctrl+p"],
			"app.tools.expand": "ctrl+x",
		};
		const agentDir = createAgentDir(config);
		const keybindings = KeybindingsManager.create(agentDir);

		expect(keybindings.getUserBindings()).toEqual(config);
		expect(keybindings.getEffectiveConfig()["tui.editor.cursorUp"]).toEqual(["up", "ctrl+p"]);
		expect(keybindings.getEffectiveConfig()["app.tools.expand"]).toBe("ctrl+x");
	});
});
