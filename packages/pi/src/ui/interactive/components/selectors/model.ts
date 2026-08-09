import { type Model, modelsAreEqual } from "@tsuuanmi/pi-ai";
import {
	Container,
	DynamicBorder,
	type Focusable,
	getKeybindings,
	type Input,
	keyHint,
	type SearchableTableColumn,
	SearchableTableSelector,
	Spacer,
	Text,
	type TUI,
	theme,
} from "@tsuuanmi/pi-tui";
import type { ModelRegistry } from "#pi/loader/model-registry";
import type { SettingsManager } from "#pi/settings/manager";
import { getModelSearchText } from "#pi/ui/interactive/model-search";

interface ModelItem {
	provider: string;
	id: string;
	model: Model<any>;
}

interface ScopedModelItem {
	model: Model<any>;
	thinkingLevel?: string;
}

type ModelScope = "all" | "scoped";

function getModelItemKey(item: ModelItem): string {
	return `${item.provider}:${item.id}`;
}

function getModelKey(model: Model<any> | undefined): string | undefined {
	return model ? `${model.provider}:${model.id}` : undefined;
}

/**
 * Component that renders a model selector with search.
 */
export class ModelSelectorComponent extends Container implements Focusable {
	private selector: SearchableTableSelector<ModelItem>;
	private allModels: ModelItem[] = [];
	private scopedModelItems: ModelItem[] = [];
	private activeModels: ModelItem[] = [];
	private currentModel?: Model<any>;
	private settingsManager: SettingsManager;
	private modelRegistry: ModelRegistry;
	private onSelectCallback: (model: Model<any>) => void;
	private errorMessage?: string;
	private tui: TUI;
	private scopedModels: ReadonlyArray<ScopedModelItem>;
	private scope: ModelScope = "all";
	private scopeText?: Text;
	private scopeHintText?: Text;

	constructor(
		tui: TUI,
		currentModel: Model<any> | undefined,
		settingsManager: SettingsManager,
		modelRegistry: ModelRegistry,
		scopedModels: ReadonlyArray<ScopedModelItem>,
		onSelect: (model: Model<any>) => void,
		onCancel: () => void,
		initialSearchInput?: string,
	) {
		super();

		this.tui = tui;
		this.currentModel = currentModel;
		this.settingsManager = settingsManager;
		this.modelRegistry = modelRegistry;
		this.scopedModels = scopedModels;
		this.scope = scopedModels.length > 0 ? "scoped" : "all";
		this.onSelectCallback = onSelect;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		if (scopedModels.length > 0) {
			this.scopeText = new Text(this.getScopeText(), 0, 0);
			this.addChild(this.scopeText);
			this.scopeHintText = new Text(this.getScopeHintText(), 0, 0);
			this.addChild(this.scopeHintText);
		} else {
			const hintText = "Only showing models from configured providers. Use /account add to add providers.";
			this.addChild(new Text(theme.fg("warning", hintText), 0, 0));
		}
		this.addChild(new Spacer(1));

		this.selector = new SearchableTableSelector({
			items: [],
			columns: this.getColumns(),
			getSearchText: ({ id, provider, model }) => getModelSearchText({ id, provider, name: model.name }),
			getItemKey: getModelItemKey,
			onSelect: (item) => this.handleSelect(item.model),
			onCancel,
			initialQuery: initialSearchInput,
			wrapNavigation: true,
			maxVisibleItems: 10,
			emptyTitle: "  No matching models",
			getEmptyLines: () => this.getEmptyLines(),
			renderSelectedDetails: (item) => ["", theme.fg("muted", `  Model Name: ${item.model.name}`)],
		});
		this.addChild(this.selector);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		this.loadModels().then(() => {
			this.tui.requestRender();
		});
	}

	get focused(): boolean {
		return this.selector.focused;
	}

	set focused(value: boolean) {
		this.selector.focused = value;
	}

	private getColumns(): SearchableTableColumn<ModelItem>[] {
		return [
			{
				id: "model",
				label: "Model",
				widthPercent: 58,
				render: (item, selected) => theme.fg(selected ? "accent" : "text", item.id),
			},
			{
				id: "provider",
				label: "Provider",
				widthPercent: 30,
				render: (item) => theme.fg("muted", `[${item.provider}]`),
			},
			{
				id: "current",
				label: "Current",
				widthPercent: 12,
				render: (item) => (modelsAreEqual(this.currentModel, item.model) ? theme.fg("success", "✓") : ""),
			},
		];
	}

	private async loadModels(): Promise<void> {
		let models: ModelItem[];

		this.modelRegistry.refresh();

		const loadError = this.modelRegistry.getError();
		if (loadError) {
			this.errorMessage = loadError;
		}

		try {
			const availableModels = await this.modelRegistry.getAvailable();
			models = availableModels.map((model: Model<any>) => ({
				provider: model.provider,
				id: model.id,
				model,
			}));
		} catch (error) {
			this.allModels = [];
			this.scopedModelItems = [];
			this.activeModels = [];
			this.errorMessage = error instanceof Error ? error.message : String(error);
			this.selector.setItems([], false);
			return;
		}

		this.allModels = this.sortModels(models);
		this.scopedModels = this.scopedModels.map((scoped) => {
			const refreshed = this.modelRegistry.find(scoped.model.provider, scoped.model.id);
			return refreshed ? { ...scoped, model: refreshed } : scoped;
		});
		this.scopedModelItems = this.scopedModels.map((scoped) => ({
			provider: scoped.model.provider,
			id: scoped.model.id,
			model: scoped.model,
		}));
		this.setActiveModels(false);
	}

	private sortModels(models: ModelItem[]): ModelItem[] {
		const sorted = [...models];
		sorted.sort((a, b) => {
			const aIsCurrent = modelsAreEqual(this.currentModel, a.model);
			const bIsCurrent = modelsAreEqual(this.currentModel, b.model);
			if (aIsCurrent && !bIsCurrent) return -1;
			if (!aIsCurrent && bIsCurrent) return 1;
			return a.provider.localeCompare(b.provider);
		});
		return sorted;
	}

	private getScopeText(): string {
		const allText = this.scope === "all" ? theme.fg("accent", "all") : theme.fg("muted", "all");
		const scopedText = this.scope === "scoped" ? theme.fg("accent", "scoped") : theme.fg("muted", "scoped");
		return `${theme.fg("muted", "Scope: ")}${allText}${theme.fg("muted", " | ")}${scopedText}`;
	}

	private getScopeHintText(): string {
		return keyHint("tui.input.tab", "scope") + theme.fg("muted", " (all/scoped)");
	}

	private setScope(scope: ModelScope): void {
		if (this.scope === scope) return;
		this.scope = scope;
		this.setActiveModels(false);
		if (this.scopeText) {
			this.scopeText.setText(this.getScopeText());
		}
	}

	private setActiveModels(preserveSelection: boolean): void {
		this.activeModels = this.scope === "scoped" ? this.scopedModelItems : this.allModels;
		this.selector.setItems(this.activeModels, preserveSelection);
		const currentKey = getModelKey(this.currentModel);
		if (currentKey) {
			this.selector.selectItemByKey(currentKey);
		}
	}

	private getEmptyLines(): string[] {
		if (!this.errorMessage) {
			return [theme.fg("muted", "  No matching models")];
		}
		return this.errorMessage.split("\n").map((line) => theme.fg("error", line));
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (this.scopedModelItems.length > 0 && kb.matches(keyData, "tui.input.tab")) {
			const nextScope: ModelScope = this.scope === "all" ? "scoped" : "all";
			this.setScope(nextScope);
			if (this.scopeHintText) {
				this.scopeHintText.setText(this.getScopeHintText());
			}
			return;
		}

		this.selector.handleInput(keyData);
	}

	private handleSelect(model: Model<any>): void {
		this.settingsManager.setDefaultModelAndProvider(model.provider, model.id);
		this.onSelectCallback(model);
	}

	getSearchInput(): Input {
		return this.selector.getSearchInput();
	}
}
