import { type Component, type Focusable, Input, theme, truncateToWidth } from "@tsuuanmi/pi-tui";
import type { KeybindingsManager } from "#pi/settings/keybindings";
import type { ResourceGroup, ResourceItem, ResourceSubgroup } from "./groups.ts";
import type { ResourceToggler } from "./toggle.ts";

type FlatEntry =
	| { type: "group"; group: ResourceGroup }
	| { type: "subgroup"; subgroup: ResourceSubgroup; group: ResourceGroup }
	| { type: "item"; item: ResourceItem };

export class ResourceList implements Component, Focusable {
	private groups: ResourceGroup[];
	private flatItems: FlatEntry[] = [];
	private filteredItems: FlatEntry[] = [];
	private selectedIndex = 0;
	private searchInput: Input;
	private maxVisible: number;
	private readonly resourceToggler: ResourceToggler;
	private readonly keybindings: KeybindingsManager;

	public onCancel?: () => void;
	public onExit?: () => void;
	public onToggle?: (item: ResourceItem, newEnabled: boolean) => void;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		groups: ResourceGroup[],
		resourceToggler: ResourceToggler,
		keybindings: KeybindingsManager,
		terminalHeight?: number,
	) {
		this.groups = groups;
		this.resourceToggler = resourceToggler;
		this.keybindings = keybindings;
		this.searchInput = new Input(keybindings);
		// 8 lines of chrome: top spacer + top border + spacer + header (2 lines) + spacer + bottom spacer + bottom border
		const chrome = 8;
		this.maxVisible = Math.max(5, (terminalHeight ?? 24) - chrome);
		this.buildFlatList();
		this.filteredItems = [...this.flatItems];
	}

	private buildFlatList(): void {
		this.flatItems = [];
		for (const group of this.groups) {
			this.flatItems.push({ type: "group", group });
			for (const subgroup of group.subgroups) {
				this.flatItems.push({ type: "subgroup", subgroup, group });
				for (const item of subgroup.items) {
					this.flatItems.push({ type: "item", item });
				}
			}
		}
		// Start selection on first item (not header)
		this.selectedIndex = this.flatItems.findIndex((e) => e.type === "item");
		if (this.selectedIndex < 0) this.selectedIndex = 0;
	}

	private findNextItem(fromIndex: number, direction: 1 | -1): number {
		let idx = fromIndex + direction;
		while (idx >= 0 && idx < this.filteredItems.length) {
			if (this.filteredItems[idx].type === "item") {
				return idx;
			}
			idx += direction;
		}
		return fromIndex; // Stay at current if no item found
	}

	private filterItems(query: string): void {
		if (!query.trim()) {
			this.filteredItems = [...this.flatItems];
			this.selectFirstItem();
			return;
		}

		const lowerQuery = query.toLowerCase();
		const matchingItems = new Set<ResourceItem>();
		const matchingSubgroups = new Set<ResourceSubgroup>();
		const matchingGroups = new Set<ResourceGroup>();

		for (const entry of this.flatItems) {
			if (entry.type === "item") {
				const item = entry.item;
				if (
					item.displayName.toLowerCase().includes(lowerQuery) ||
					item.resourceType.toLowerCase().includes(lowerQuery) ||
					item.path.toLowerCase().includes(lowerQuery)
				) {
					matchingItems.add(item);
				}
			}
		}

		// Find which subgroups and groups contain matching items
		for (const group of this.groups) {
			for (const subgroup of group.subgroups) {
				for (const item of subgroup.items) {
					if (matchingItems.has(item)) {
						matchingSubgroups.add(subgroup);
						matchingGroups.add(group);
					}
				}
			}
		}

		this.filteredItems = [];
		for (const entry of this.flatItems) {
			if (entry.type === "group" && matchingGroups.has(entry.group)) {
				this.filteredItems.push(entry);
			} else if (entry.type === "subgroup" && matchingSubgroups.has(entry.subgroup)) {
				this.filteredItems.push(entry);
			} else if (entry.type === "item" && matchingItems.has(entry.item)) {
				this.filteredItems.push(entry);
			}
		}

		this.selectFirstItem();
	}

	private selectFirstItem(): void {
		const firstItemIndex = this.filteredItems.findIndex((e) => e.type === "item");
		this.selectedIndex = firstItemIndex >= 0 ? firstItemIndex : 0;
	}

	updateItem(item: ResourceItem, enabled: boolean): void {
		item.enabled = enabled;
		// Update in groups too
		for (const group of this.groups) {
			for (const subgroup of group.subgroups) {
				const found = subgroup.items.find((i) => i.path === item.path && i.resourceType === item.resourceType);
				if (found) {
					found.enabled = enabled;
					return;
				}
			}
		}
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];

		// Search input
		lines.push(...this.searchInput.render(width));
		lines.push("");

		if (this.filteredItems.length === 0) {
			lines.push(theme.fg("muted", "  No resources found"));
			return lines;
		}

		// Calculate visible range
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.filteredItems.length - this.maxVisible),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, this.filteredItems.length);

		for (let i = startIndex; i < endIndex; i++) {
			const entry = this.filteredItems[i];
			const isSelected = i === this.selectedIndex;

			if (entry.type === "group") {
				// Main group header (no cursor)
				const groupLine = theme.fg("accent", theme.bold(entry.group.label));
				lines.push(truncateToWidth(`  ${groupLine}`, width, ""));
			} else if (entry.type === "subgroup") {
				// Subgroup header (indented, no cursor)
				const subgroupLine = theme.fg("muted", entry.subgroup.label);
				lines.push(truncateToWidth(`    ${subgroupLine}`, width, ""));
			} else {
				// Resource item (cursor only on items)
				const item = entry.item;
				const cursor = isSelected ? "> " : "  ";
				const checkbox = item.enabled ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
				const name = isSelected ? theme.bold(item.displayName) : item.displayName;
				lines.push(truncateToWidth(`${cursor}    ${checkbox} ${name}`, width, "..."));
			}
		}

		// Scroll indicator
		if (startIndex > 0 || endIndex < this.filteredItems.length) {
			const itemCount = this.filteredItems.filter((e) => e.type === "item").length;
			const currentItemIndex =
				this.filteredItems.slice(0, this.selectedIndex).filter((e) => e.type === "item").length + 1;
			lines.push(theme.fg("dim", `  (${currentItemIndex}/${itemCount})`));
		}

		return lines;
	}

	handleInput(data: string): void {
		const kb = this.keybindings;

		if (kb.matches(data, "tui.select.up")) {
			this.selectedIndex = this.findNextItem(this.selectedIndex, -1);
			return;
		}
		if (kb.matches(data, "tui.select.down")) {
			this.selectedIndex = this.findNextItem(this.selectedIndex, 1);
			return;
		}
		if (kb.matches(data, "tui.select.pageUp")) {
			// Jump up by maxVisible, then find nearest item
			let target = Math.max(0, this.selectedIndex - this.maxVisible);
			while (target < this.filteredItems.length && this.filteredItems[target].type !== "item") {
				target++;
			}
			if (target < this.filteredItems.length) {
				this.selectedIndex = target;
			}
			return;
		}
		if (kb.matches(data, "tui.select.pageDown")) {
			// Jump down by maxVisible, then find nearest item
			let target = Math.min(this.filteredItems.length - 1, this.selectedIndex + this.maxVisible);
			while (target >= 0 && this.filteredItems[target].type !== "item") {
				target--;
			}
			if (target >= 0) {
				this.selectedIndex = target;
			}
			return;
		}
		if (kb.matches(data, "tui.select.cancel")) {
			this.onCancel?.();
			return;
		}
		if (kb.matches(data, "app.interrupt")) {
			this.onExit?.();
			return;
		}
		if (data === " " || kb.matches(data, "tui.select.confirm")) {
			const entry = this.filteredItems[this.selectedIndex];
			if (entry?.type === "item") {
				const newEnabled = !entry.item.enabled;
				this.resourceToggler.toggle(entry.item, newEnabled);
				this.updateItem(entry.item, newEnabled);
				this.onToggle?.(entry.item, newEnabled);
			}
			return;
		}

		// Pass to search input
		this.searchInput.handleInput(data);
		this.filterItems(this.searchInput.getValue());
	}
}
