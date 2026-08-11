import {
	Container,
	DynamicBorder,
	type Focusable,
	type KeybindingsManager,
	type SearchableTableColumn,
	SearchableTableSelector,
	Spacer,
	theme,
} from "@tsuuanmi/pi-tui";

const MIN_TABLE_WIDTH = 72;

export type AccountSelectorOption = {
	providerId: string;
	providerName: string;
	accountName: string;
	active: boolean;
	quotaText?: string;
	quotaStatus?: "ok" | "warning" | "exhausted";
};

const ACCOUNT_COLUMNS: SearchableTableColumn<AccountSelectorOption>[] = [
	{
		id: "provider",
		label: "Provider",
		widthPercent: 36,
		render: (option, selected) =>
			theme.fg(selected ? "accent" : "text", `${option.providerName} (${option.providerId})`),
	},
	{
		id: "account",
		label: "Account",
		widthPercent: 22,
		render: (option, selected) => theme.fg(selected ? "accent" : "text", option.accountName),
	},
	{
		id: "status",
		label: "Status",
		widthPercent: 10,
		render: (option) => theme.fg(option.active ? "success" : "muted", option.active ? "active" : "stored"),
	},
	{
		id: "quota",
		label: "Quota",
		widthPercent: 32,
		render: (option) => {
			const quotaColor =
				option.quotaStatus === "exhausted" ? "error" : option.quotaStatus === "warning" ? "warning" : "muted";
			return theme.fg(quotaColor, option.quotaText ?? "-");
		},
	},
];

function getAccountSearchText(option: AccountSelectorOption): string {
	return `${option.providerName} ${option.providerId} ${option.accountName}`;
}

function getAccountKey(option: AccountSelectorOption): string {
	return `${option.providerId}:${option.accountName}`;
}

export class AccountSelectorComponent extends Container implements Focusable {
	private selector: SearchableTableSelector<AccountSelectorOption>;

	constructor(
		keybindings: KeybindingsManager,
		options: AccountSelectorOption[],
		onSelect: (option: AccountSelectorOption) => void,
		onCancel: () => void,
	) {
		super();

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.selector = new SearchableTableSelector({
			keybindings,
			items: options,
			columns: ACCOUNT_COLUMNS,
			getSearchText: getAccountSearchText,
			getItemKey: getAccountKey,
			onSelect,
			onCancel,
			title: `Accounts (${options.length})`,
			description: "Search, inspect quota, then select the account to make active.",
			emptyTitle: "  No matching accounts",
			emptyDescription: "  Try a provider name, provider id, or account name.",
			maxVisibleItems: 10,
			minTableWidth: MIN_TABLE_WIDTH,
		});
		this.addChild(this.selector);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	get focused(): boolean {
		return this.selector.focused;
	}

	set focused(value: boolean) {
		this.selector.focused = value;
	}

	updateOptions(options: AccountSelectorOption[]): void {
		this.selector.setItems(options);
	}

	handleInput(keyData: string): void {
		this.selector.handleInput(keyData);
	}
}
