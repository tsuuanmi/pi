import { Container, type Focusable } from "#tui/components/component";
import { TruncatedText } from "#tui/components/display/truncated-text";
import { Input } from "#tui/components/inputs/input";
import { Spacer } from "#tui/components/layout/spacer";
import { fuzzyFilter } from "#tui/editor/completion/fuzzy";
import { keyHint, rawKeyHint } from "#tui/input/keyboard/key-hints";
import type { KeybindingsManager } from "#tui/input/keyboard/keybindings";
import { theme } from "#tui/theme/theme";
import { truncateToWidth, visibleWidth } from "#tui/utilities/text";

const DEFAULT_GUTTER_WIDTH = 2;
const DEFAULT_TABLE_GAP = "  ";
const TABLE_BORDER_WIDTH = 2;
const DEFAULT_ROW_PADDING_X = 1;
const MIN_COLUMN_CONTENT_WIDTH = 4;

export interface SearchableTableColumn<T> {
	id: string;
	label: string;
	widthPercent: number;
	render: (item: T, selected: boolean) => string;
}

export interface SearchableTableSelectorOptions<T> {
	keybindings: KeybindingsManager;
	items: T[];
	columns: SearchableTableColumn<T>[];
	getSearchText: (item: T) => string;
	onSelect: (item: T) => void;
	onCancel: () => void;
	getItemKey?: (item: T) => string;
	title?: string;
	description?: string;
	emptyTitle?: string;
	emptyDescription?: string;
	getEmptyLines?: () => string[];
	renderSelectedDetails?: (item: T) => string[];
	initialQuery?: string;
	wrapNavigation?: boolean;
	maxVisibleItems?: number;
	minTableWidth?: number;
}

function fitCell(text: string, width: number): string {
	const fitted = truncateToWidth(text, width);
	return `${fitted}${" ".repeat(Math.max(0, width - visibleWidth(fitted)))}`;
}

function tableBorder(left: string, fill: string, right: string, width: number): string {
	return `${left}${fill.repeat(Math.max(0, width - TABLE_BORDER_WIDTH))}${right}`;
}

function tableRow(content: string, width: number): string {
	const innerWidth = Math.max(0, width - TABLE_BORDER_WIDTH);
	const truncated = truncateToWidth(content, innerWidth);
	return `│${truncated}${" ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)))}│`;
}

function getColumnWidths<T>(columns: SearchableTableColumn<T>[], contentWidth: number): number[] {
	const widths = columns.map((column) => Math.floor((contentWidth * column.widthPercent) / 100));
	let remainder = contentWidth - widths.reduce((sum, width) => sum + width, 0);
	for (let index = 0; index < widths.length && remainder > 0; index++) {
		widths[index]++;
		remainder--;
	}
	return widths;
}

export class SearchableTableSelector<T> extends Container implements Focusable {
	private readonly options: SearchableTableSelectorOptions<T>;
	private searchInput: Input;
	private listContainer: Container;
	private items: T[];
	private filteredItems: T[];
	private selectedIndex = 0;
	private tableWidth = 0;
	private _focused = false;

	constructor(options: SearchableTableSelectorOptions<T>) {
		super();
		this.options = options;
		this.items = options.items;
		this.filteredItems = options.items;

		if (options.title) {
			this.addChild(new TruncatedText(theme.fg("accent", theme.bold(options.title)), 1, 0));
		}
		if (options.description) {
			this.addChild(new TruncatedText(theme.fg("muted", options.description), 1, 0));
		}
		if (options.title || options.description) {
			this.addChild(new Spacer(1));
		}

		this.searchInput = new Input(options.keybindings);
		if (options.initialQuery) {
			this.searchInput.setValue(options.initialQuery);
		}
		this.searchInput.onSubmit = () => this.selectCurrent();
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));

		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(
			new TruncatedText(
				rawKeyHint("↑↓", "navigate") +
					"  " +
					keyHint(options.keybindings, "tui.select.confirm", "select") +
					"  " +
					keyHint(options.keybindings, "tui.select.cancel", "cancel"),
				1,
				0,
			),
		);

		this.filterItems(options.initialQuery ?? "");
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	override render(width: number): string[] {
		if (this.tableWidth !== width) {
			this.tableWidth = width;
			this.updateList();
		}
		return super.render(width);
	}

	getSelectedItem(): T | undefined {
		return this.filteredItems[this.selectedIndex];
	}

	getSearchInput(): Input {
		return this.searchInput;
	}

	setQuery(query: string, resetSelection = true): void {
		this.searchInput.setValue(query);
		this.filterItems(query, resetSelection);
	}

	selectItemByKey(key: string): boolean {
		if (!this.options.getItemKey) return false;
		const selectedIndex = this.filteredItems.findIndex((item) => this.options.getItemKey?.(item) === key);
		if (selectedIndex < 0) return false;
		this.selectedIndex = selectedIndex;
		this.updateList();
		return true;
	}

	setItems(items: T[], preserveSelection = true): void {
		const current = preserveSelection ? this.getSelectedItem() : undefined;
		const currentKey = current && this.options.getItemKey ? this.options.getItemKey(current) : undefined;
		this.items = items;
		this.filterItems(this.searchInput.getValue(), !preserveSelection);
		if (!currentKey || !this.options.getItemKey) return;
		const selectedIndex = this.filteredItems.findIndex((item) => this.options.getItemKey?.(item) === currentKey);
		if (selectedIndex >= 0) {
			this.selectedIndex = selectedIndex;
			this.updateList();
		}
	}

	handleInput(keyData: string): void {
		const kb = this.options.keybindings;
		if (kb.matches(keyData, "tui.select.up")) {
			if (this.filteredItems.length === 0) return;
			this.selectedIndex =
				this.options.wrapNavigation && this.selectedIndex === 0
					? this.filteredItems.length - 1
					: Math.max(0, this.selectedIndex - 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.down")) {
			if (this.filteredItems.length === 0) return;
			this.selectedIndex =
				this.options.wrapNavigation && this.selectedIndex === this.filteredItems.length - 1
					? 0
					: Math.min(this.filteredItems.length - 1, this.selectedIndex + 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			this.selectCurrent();
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.options.onCancel();
		} else {
			this.searchInput.handleInput(keyData);
			this.filterItems(this.searchInput.getValue());
		}
	}

	private filterItems(query: string, resetSelection = true): void {
		this.filteredItems = query ? fuzzyFilter(this.items, query, this.options.getSearchText) : this.items;
		if (resetSelection) this.selectedIndex = 0;
		this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, Math.max(0, this.filteredItems.length - 1)));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		const columns = this.options.columns;
		const tableWidth = Math.max(this.options.minTableWidth ?? 0, this.tableWidth - DEFAULT_ROW_PADDING_X * 2);
		const innerWidth = Math.max(0, tableWidth - TABLE_BORDER_WIDTH);
		const gapWidth = DEFAULT_TABLE_GAP.length * Math.max(0, columns.length - 1);
		const columnContentWidth = Math.max(MIN_COLUMN_CONTENT_WIDTH, innerWidth - DEFAULT_GUTTER_WIDTH - gapWidth);
		const widths = getColumnWidths(columns, columnContentWidth);
		const maxVisible = this.options.maxVisibleItems ?? 10;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredItems.length - maxVisible),
		);
		const endIndex = Math.min(startIndex + maxVisible, this.filteredItems.length);

		if (this.filteredItems.length > 0) {
			const header = columns
				.map((column, index) => fitCell(column.label, widths[index] ?? 0))
				.join(DEFAULT_TABLE_GAP);
			const separator = widths.map((width) => "-".repeat(width)).join(DEFAULT_TABLE_GAP);
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", tableBorder("╭", "─", "╮", tableWidth)), 1, 0),
			);
			this.listContainer.addChild(
				new TruncatedText(
					theme.fg("muted", tableRow(`${" ".repeat(DEFAULT_GUTTER_WIDTH)}${header}`, tableWidth)),
					1,
					0,
				),
			);
			this.listContainer.addChild(
				new TruncatedText(
					theme.fg("muted", tableRow(`${" ".repeat(DEFAULT_GUTTER_WIDTH)}${separator}`, tableWidth)),
					1,
					0,
				),
			);
		}

		for (let index = startIndex; index < endIndex; index++) {
			const item = this.filteredItems[index];
			if (!item) continue;
			const selected = index === this.selectedIndex;
			const prefix = selected ? theme.fg("accent", "→ ") : " ".repeat(DEFAULT_GUTTER_WIDTH);
			const cells = columns.map((column, columnIndex) =>
				fitCell(column.render(item, selected), widths[columnIndex] ?? 0),
			);
			this.listContainer.addChild(
				new TruncatedText(tableRow(`${prefix}${cells.join(DEFAULT_TABLE_GAP)}`, tableWidth), 1, 0),
			);
		}

		if (this.filteredItems.length > 0) {
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", tableBorder("╰", "─", "╯", tableWidth)), 1, 0),
			);
		}

		if (startIndex > 0 || endIndex < this.filteredItems.length) {
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filteredItems.length})`), 1, 0),
			);
		}

		if (this.filteredItems.length === 0) {
			const emptyLines = this.options.getEmptyLines?.();
			if (emptyLines && emptyLines.length > 0) {
				for (const line of emptyLines) {
					this.listContainer.addChild(new TruncatedText(line, 1, 0));
				}
			} else {
				this.listContainer.addChild(
					new TruncatedText(theme.fg("muted", this.options.emptyTitle ?? "  No matching items"), 1, 0),
				);
				if (this.options.emptyDescription) {
					this.listContainer.addChild(new TruncatedText(theme.fg("muted", this.options.emptyDescription), 1, 0));
				}
			}
		} else {
			const selected = this.getSelectedItem();
			if (selected && this.options.renderSelectedDetails) {
				for (const line of this.options.renderSelectedDetails(selected)) {
					this.listContainer.addChild(new TruncatedText(line, 1, 0));
				}
			}
		}
	}

	private selectCurrent(): void {
		const selected = this.getSelectedItem();
		if (selected) this.options.onSelect(selected);
	}
}
