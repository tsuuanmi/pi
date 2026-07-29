import assert from "node:assert";
import { describe, it } from "node:test";
import { ThemeSelectorComponent } from "#tui/components/selection/theme-selector";
import { initTheme } from "#tui/theme/theme";

function noop(): void {}

describe("ThemeSelectorComponent", () => {
	it("renders available themes and preselects the current theme", () => {
		initTheme("dark");

		const component = new ThemeSelectorComponent("dark", noop, noop, noop);
		const lines = component.render(80);

		assert.ok(lines.length > 0);
		assert.strictEqual(component.getSelectList().getSelectedItem()?.value, "dark");
		assert.ok(lines.some((line) => line.includes("dark")));
	});
});
