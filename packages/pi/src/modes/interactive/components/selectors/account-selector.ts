import {
	Container,
	type Focusable,
	fuzzyFilter,
	getKeybindings,
	Input,
	keyHint,
	rawKeyHint,
	Spacer,
	TruncatedText,
	theme,
	truncateToWidth,
	visibleWidth,
} from "@tsuuanmi/pi-tui";
import { DynamicBorder } from "#pi/modes/interactive/components/widgets/dynamic-border";

const SELECTOR_GUTTER_WIDTH = 2;
const MIN_TABLE_WIDTH = 72;
const TABLE_GAP = "  ";
const TABLE_BORDER_WIDTH = 2;
const ROW_PADDING_X = 1;

const COLUMN_WIDTH_PERCENT = {
	provider: 36,
	account: 22,
	status: 10,
	quota: 32,
} as const;

function fitCell(text: string, width: number): string {
	const fitted = truncateToWidth(text, width);
	return `${fitted}${" ".repeat(Math.max(0, width - visibleWidth(fitted)))}`;
}

function rowGutter(): string {
	return " ".repeat(SELECTOR_GUTTER_WIDTH);
}

function getColumnWidths(contentWidth: number): Record<keyof typeof COLUMN_WIDTH_PERCENT, number> {
	const entries = Object.entries(COLUMN_WIDTH_PERCENT) as Array<[keyof typeof COLUMN_WIDTH_PERCENT, number]>;
	const widths = Object.fromEntries(
		entries.map(([key, percent]) => [key, Math.floor((contentWidth * percent) / 100)]),
	) as Record<keyof typeof COLUMN_WIDTH_PERCENT, number>;
	let remainder = contentWidth - Object.values(widths).reduce((sum, width) => sum + width, 0);
	for (const [key] of entries) {
		if (remainder <= 0) break;
		widths[key]++;
		remainder--;
	}
	return widths;
}

function tableBorder(left: string, fill: string, right: string, width: number): string {
	return `${left}${fill.repeat(Math.max(0, width - TABLE_BORDER_WIDTH))}${right}`;
}

function tableRow(content: string, width: number): string {
	const innerWidth = Math.max(0, width - TABLE_BORDER_WIDTH);
	const truncated = truncateToWidth(content, innerWidth);
	return `│${truncated}${" ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)))}│`;
}

export type AccountSelectorOption = {
	providerId: string;
	providerName: string;
	accountName: string;
	active: boolean;
	quotaText?: string;
	quotaStatus?: "ok" | "warning" | "exhausted";
};

export class AccountSelectorComponent extends Container implements Focusable {
	private searchInput: Input;
	private listContainer: Container;
	private allOptions: AccountSelectorOption[];
	private filteredOptions: AccountSelectorOption[];
	private selectedIndex = 0;
	private onSelectCallback: (option: AccountSelectorOption) => void;
	private onCancelCallback: () => void;
	private tableWidth = 0;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		options: AccountSelectorOption[],
		onSelect: (option: AccountSelectorOption) => void,
		onCancel: () => void,
	) {
		super();

		this.allOptions = options;
		this.filteredOptions = options;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new TruncatedText(theme.fg("accent", theme.bold(`Accounts (${options.length})`)), 1, 0));
		this.addChild(
			new TruncatedText(theme.fg("muted", "Search, inspect quota, then select the account to make active."), 1, 0),
		);
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
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
					keyHint("tui.select.confirm", "select") +
					"  " +
					keyHint("tui.select.cancel", "cancel"),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		this.filterOptions("");
	}

	override render(width: number): string[] {
		if (this.tableWidth !== width) {
			this.tableWidth = width;
			this.updateList();
		}
		return super.render(width);
	}

	updateOptions(options: AccountSelectorOption[]): void {
		const current = this.filteredOptions[this.selectedIndex];
		this.allOptions = options;
		this.filterOptions(this.searchInput.getValue(), false);
		if (!current) return;
		const selectedIndex = this.filteredOptions.findIndex(
			(option) => option.providerId === current.providerId && option.accountName === current.accountName,
		);
		if (selectedIndex >= 0) {
			this.selectedIndex = selectedIndex;
			this.updateList();
		}
	}

	private filterOptions(query: string, resetSelection = true): void {
		this.filteredOptions = query
			? fuzzyFilter(
					this.allOptions,
					query,
					(option) => `${option.providerName} ${option.providerId} ${option.accountName}`,
				)
			: this.allOptions;
		if (resetSelection) this.selectedIndex = 0;
		this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, Math.max(0, this.filteredOptions.length - 1)));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		const tableWidth = Math.max(MIN_TABLE_WIDTH, this.tableWidth - ROW_PADDING_X * 2);
		const innerWidth = Math.max(0, tableWidth - TABLE_BORDER_WIDTH);
		const columnContentWidth = Math.max(4, innerWidth - SELECTOR_GUTTER_WIDTH - TABLE_GAP.length * 3);
		const widths = getColumnWidths(columnContentWidth);
		const providerWidth = widths.provider;
		const accountWidth = widths.account;
		const statusWidth = widths.status;
		const quotaWidth = widths.quota;
		const maxVisible = 10;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredOptions.length - maxVisible),
		);
		const endIndex = Math.min(startIndex + maxVisible, this.filteredOptions.length);

		if (this.filteredOptions.length > 0) {
			const header = [
				fitCell("Provider", providerWidth),
				fitCell("Account", accountWidth),
				fitCell("Status", statusWidth),
				fitCell("Quota", quotaWidth),
			].join(TABLE_GAP);
			const separator = [
				"-".repeat(providerWidth),
				"-".repeat(accountWidth),
				"-".repeat(statusWidth),
				"-".repeat(quotaWidth),
			].join(TABLE_GAP);
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", tableBorder("╭", "─", "╮", tableWidth)), 1, 0),
			);
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", tableRow(`${rowGutter()}${header}`, tableWidth)), 1, 0),
			);
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", tableRow(`${rowGutter()}${separator}`, tableWidth)), 1, 0),
			);
		}

		for (let i = startIndex; i < endIndex; i++) {
			const option = this.filteredOptions[i];
			if (!option) continue;

			const selected = i === this.selectedIndex;
			const prefix = selected ? theme.fg("accent", "→ ") : rowGutter();
			const providerText = fitCell(`${option.providerName} (${option.providerId})`, providerWidth);
			const accountText = fitCell(option.accountName, accountWidth);
			const statusText = fitCell(option.active ? "active" : "stored", statusWidth);
			const quotaText = fitCell(option.quotaText ?? "-", quotaWidth);
			const provider = theme.fg(selected ? "accent" : "text", providerText);
			const account = theme.fg(selected ? "accent" : "text", accountText);
			const status = option.active ? theme.fg("success", statusText) : theme.fg("muted", statusText);
			const quotaColor =
				option.quotaStatus === "exhausted" ? "error" : option.quotaStatus === "warning" ? "warning" : "muted";
			const quota = theme.fg(quotaColor, quotaText);
			this.listContainer.addChild(
				new TruncatedText(
					tableRow(`${prefix}${[provider, account, status, quota].join(TABLE_GAP)}`, tableWidth),
					1,
					0,
				),
			);
		}

		if (this.filteredOptions.length > 0) {
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", tableBorder("╰", "─", "╯", tableWidth)), 1, 0),
			);
		}

		if (startIndex > 0 || endIndex < this.filteredOptions.length) {
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filteredOptions.length})`), 1, 0),
			);
		}

		if (this.filteredOptions.length === 0) {
			this.listContainer.addChild(new TruncatedText(theme.fg("muted", "  No matching accounts"), 1, 0));
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", "  Try a provider name, provider id, or account name."), 1, 0),
			);
		}
	}

	private selectCurrent(): void {
		const selected = this.filteredOptions[this.selectedIndex];
		if (selected) this.onSelectCallback(selected);
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.up")) {
			if (this.filteredOptions.length === 0) return;
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.down")) {
			if (this.filteredOptions.length === 0) return;
			this.selectedIndex = Math.min(this.filteredOptions.length - 1, this.selectedIndex + 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			this.selectCurrent();
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
		} else {
			this.searchInput.handleInput(keyData);
			this.filterOptions(this.searchInput.getValue());
		}
	}
}
