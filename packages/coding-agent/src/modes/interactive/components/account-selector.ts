import { Container, type Focusable, fuzzyFilter, getKeybindings, Input, Spacer, TruncatedText } from "@tsuuanmi/pi-tui";
import { theme } from "../../../theme/theme.ts";
import { keyHint, rawKeyHint } from "../../../ui/rendering/keybinding-hints.ts";
import { DynamicBorder } from "./dynamic-border.ts";

export type AccountSelectorOption = {
	providerId: string;
	providerName: string;
	accountName: string;
	active: boolean;
};

export class AccountSelectorComponent extends Container implements Focusable {
	private searchInput: Input;
	private listContainer: Container;
	private allOptions: AccountSelectorOption[];
	private filteredOptions: AccountSelectorOption[];
	private selectedIndex = 0;
	private onSelectCallback: (option: AccountSelectorOption) => void;
	private onCancelCallback: () => void;
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
		this.addChild(new TruncatedText(theme.fg("accent", theme.bold("Select account:")), 1, 0));
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

	private filterOptions(query: string): void {
		this.filteredOptions = query
			? fuzzyFilter(
					this.allOptions,
					query,
					(option) => `${option.providerName} ${option.providerId} ${option.accountName}`,
				)
			: this.allOptions;
		this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, Math.max(0, this.filteredOptions.length - 1)));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		const maxVisible = 8;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredOptions.length - maxVisible),
		);
		const endIndex = Math.min(startIndex + maxVisible, this.filteredOptions.length);

		for (let i = startIndex; i < endIndex; i++) {
			const option = this.filteredOptions[i];
			if (!option) continue;

			const prefix = i === this.selectedIndex ? theme.fg("accent", "→ ") : "  ";
			const provider =
				i === this.selectedIndex ? theme.fg("accent", option.providerName) : theme.fg("text", option.providerName);
			const account =
				i === this.selectedIndex ? theme.fg("accent", option.accountName) : theme.fg("text", option.accountName);
			const id = theme.fg("muted", ` (${option.providerId})`);
			const active = option.active ? theme.fg("success", " ✓ active") : "";
			this.listContainer.addChild(new TruncatedText(`${prefix}${provider}${id}  ${account}${active}`, 1, 0));
		}

		if (startIndex > 0 || endIndex < this.filteredOptions.length) {
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filteredOptions.length})`), 1, 0),
			);
		}

		if (this.filteredOptions.length === 0) {
			this.listContainer.addChild(new TruncatedText(theme.fg("muted", "  No matching accounts"), 1, 0));
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
