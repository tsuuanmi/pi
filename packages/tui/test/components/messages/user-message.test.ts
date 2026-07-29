import assert from "node:assert";
import { describe, it } from "node:test";
import { UserMessageComponent } from "#tui/components/messages/user-message";
import { initTheme } from "#tui/theme/theme";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const BG_RESET = "\x1b[49m";

describe("UserMessageComponent", () => {
	it("keeps user message height stable while moving closing OSC markers off line end", () => {
		initTheme("dark");

		const component = new UserMessageComponent("hello");
		const lines = component.render(20);

		assert.strictEqual(lines.length, 3);
		assert.ok(lines[0]?.includes(OSC133_ZONE_START));
		assert.strictEqual(lines[0]?.endsWith(BG_RESET), true);
		assert.strictEqual(lines[0]?.includes(OSC133_ZONE_END), false);
		assert.ok(lines[1]?.includes("hello"));
		assert.strictEqual(lines[2]?.startsWith(OSC133_ZONE_END + OSC133_ZONE_FINAL), true);
		assert.strictEqual(lines[2]?.endsWith(BG_RESET), true);
	});
});
