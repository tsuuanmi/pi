import assert from "node:assert";
import { describe, it } from "node:test";
import { SearchableTableSelector } from "#tui/components/selection/table-selector";
import { KeybindingsManager, TUI_KEYBINDINGS } from "#tui/input/keyboard/keybindings";
import { initTheme } from "#tui/theme/theme";

interface TestItem {
	id: string;
	name: string;
	status: string;
}

const ITEMS: TestItem[] = [
	{ id: "alpha", name: "Alpha Account", status: "active" },
	{ id: "beta", name: "Beta Account", status: "stored" },
];

function createSelector(onSelect: (item: TestItem) => void): SearchableTableSelector<TestItem> {
	return new SearchableTableSelector({
		keybindings,
		items: ITEMS,
		columns: [
			{ id: "name", label: "Name", widthPercent: 70, render: (item) => item.name },
			{ id: "status", label: "Status", widthPercent: 30, render: (item) => item.status },
		],
		getSearchText: (item) => `${item.id} ${item.name} ${item.status}`,
		onSelect,
		onCancel: () => undefined,
		minTableWidth: 40,
	});
}

const keybindings = new KeybindingsManager(TUI_KEYBINDINGS);

describe("SearchableTableSelector", () => {
	it("renders a searchable table and selects the filtered item", () => {
		initTheme("dark");
		let selected: TestItem | undefined;
		const selector = createSelector((item) => {
			selected = item;
		});

		const initialLines = selector.render(80);
		assert.ok(initialLines.some((line) => line.includes("Name")));
		assert.ok(initialLines.some((line) => line.includes("Alpha Account")));
		assert.ok(initialLines.some((line) => line.includes("Beta Account")));

		selector.handleInput("beta");
		const filteredLines = selector.render(80);
		assert.strictEqual(selector.getSelectedItem()?.id, "beta");
		assert.ok(filteredLines.some((line) => line.includes("Beta Account")));
		assert.strictEqual(
			filteredLines.some((line) => line.includes("Alpha Account")),
			false,
		);

		selector.handleInput("\r");
		assert.strictEqual(selected?.id, "beta");
	});

	it("supports initial query, selected details, key selection, and wrapped navigation", () => {
		initTheme("dark");
		const selector = new SearchableTableSelector({
			keybindings,
			items: ITEMS,
			columns: [
				{ id: "name", label: "Name", widthPercent: 70, render: (item) => item.name },
				{ id: "status", label: "Status", widthPercent: 30, render: (item) => item.status },
			],
			getSearchText: (item) => `${item.id} ${item.name} ${item.status}`,
			getItemKey: (item) => item.id,
			onSelect: () => undefined,
			onCancel: () => undefined,
			initialQuery: "account",
			wrapNavigation: true,
			minTableWidth: 40,
			renderSelectedDetails: (item) => [`detail:${item.id}`],
		});

		assert.strictEqual(selector.selectItemByKey("beta"), true);
		let lines = selector.render(80);
		assert.strictEqual(selector.getSelectedItem()?.id, "beta");
		assert.ok(lines.some((line) => line.includes("detail:beta")));

		selector.handleInput("\x1b[B");
		assert.strictEqual(selector.getSelectedItem()?.id, "alpha");
		lines = selector.render(80);
		assert.ok(lines.some((line) => line.includes("detail:alpha")));
	});
});
