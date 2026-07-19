import type { ThinkingLevel } from "@tsuuanmi/pi-agent";
import type { Transport } from "@tsuuanmi/pi-ai";
import {
	Container,
	fuzzyFilter,
	getKeybindings,
	Input,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type SettingItem,
	SettingsList,
	Spacer,
	Text,
} from "@tsuuanmi/pi-tui";
import { formatHttpIdleTimeoutMs, HTTP_IDLE_TIMEOUT_CHOICES } from "#pi/exec/http-dispatcher";
import { DynamicBorder } from "#pi/modes/interactive/components/widgets/dynamic-border";
import { getSelectListTheme, getSettingsListTheme, theme } from "#pi/theme/theme";
import { keyDisplayText, keyHint } from "#pi/ui/rendering/keybinding-hints";

const SETTINGS_SUBMENU_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 32,
};

const THINKING_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "No reasoning",
	minimal: "Very brief reasoning (~1k tokens)",
	low: "Light reasoning (~2k tokens)",
	medium: "Moderate reasoning (~8k tokens)",
	high: "Deep reasoning (~16k tokens)",
	xhigh: "Maximum reasoning (~32k tokens)",
};

export interface AgentSettingsProfile {
	name: string;
	description?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
}

export interface AgentSettingsModelOption {
	value: string;
	label: string;
	description?: string;
}

export interface SettingsConfig {
	autoCompact: boolean;
	enableSkillCommands: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	transport: Transport;
	httpIdleTimeoutMs: number;
	mainModel: string;
	thinkingLevel: ThinkingLevel;
	availableThinkingLevels: ThinkingLevel[];
	currentTheme: string;
	availableThemes: string[];
	hideThinkingBlock: boolean;
	showHardwareCursor: boolean;
	quietStartup: boolean;
	agentProfiles: AgentSettingsProfile[];
	agentModelOverrides: Record<string, string>;
	agentThinkingLevelOverrides: Record<string, ThinkingLevel>;
	agentModelOptions: AgentSettingsModelOption[];
}

export interface SettingsCallbacks {
	onAutoCompactChange: (enabled: boolean) => void;
	onEnableSkillCommandsChange: (enabled: boolean) => void;
	onSteeringModeChange: (mode: "all" | "one-at-a-time") => void;
	onFollowUpModeChange: (mode: "all" | "one-at-a-time") => void;
	onTransportChange: (transport: Transport) => void;
	onHttpIdleTimeoutMsChange: (timeoutMs: number) => void;
	onThinkingLevelChange: (level: ThinkingLevel) => void;
	onThemeChange: (theme: string) => void;
	onThemePreview?: (theme: string) => void;
	onHideThinkingBlockChange: (hidden: boolean) => void;
	onShowHardwareCursorChange: (enabled: boolean) => void;
	onQuietStartupChange: (enabled: boolean) => void;
	onMainModelChange: (modelRef: string) => void;
	onAgentModelOverrideChange: (agentName: string, modelRef: string | undefined) => void;
	onAgentThinkingLevelOverrideChange: (agentName: string, level: ThinkingLevel | undefined) => void;
	onCancel: () => void;
}

interface RoleSettingsEntry {
	name: string;
	description?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	isMain?: boolean;
}

class RoleModelPickerSubmenu extends Container {
	private searchInput: Input;
	private listContainer: Container;
	private filteredModels: AgentSettingsModelOption[];
	private selectedIndex = 0;
	private readonly models: AgentSettingsModelOption[];
	private readonly currentModel: string | undefined;
	private readonly allowProfileDefault: boolean;
	private readonly onSelect: (modelRef: string | undefined) => void;
	private readonly onCancel: () => void;

	constructor(
		models: AgentSettingsModelOption[],
		currentModel: string | undefined,
		allowProfileDefault: boolean,
		onSelect: (modelRef: string | undefined) => void,
		onCancel: () => void,
	) {
		super();
		this.models = models;
		this.currentModel = currentModel;
		this.allowProfileDefault = allowProfileDefault;
		this.onSelect = onSelect;
		this.onCancel = onCancel;
		this.filteredModels = models;

		this.addChild(new Text(theme.bold(theme.fg("accent", "Role model")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", "Search models and press Enter to select."), 0, 0));
		this.addChild(new Text(keyHint("tui.select.cancel", "back"), 0, 0));
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
		this.searchInput.onSubmit = () => this.selectCurrent();
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));

		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.updateList();
	}

	private get options(): AgentSettingsModelOption[] {
		return this.allowProfileDefault
			? [{ value: "profile default", label: "profile default" }, ...this.filteredModels]
			: this.filteredModels;
	}

	private filterModels(query: string): void {
		this.filteredModels = query
			? fuzzyFilter(this.models, query, (model) => `${model.label} ${model.description ?? ""}`)
			: this.models;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.options.length - 1));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		const options = this.options;
		const maxVisible = 10;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), options.length - maxVisible),
		);
		const endIndex = Math.min(startIndex + maxVisible, options.length);

		for (let i = startIndex; i < endIndex; i++) {
			const option = options[i];
			if (!option) continue;
			const isSelected = i === this.selectedIndex;
			const isProfileDefault = option.value === "profile default";
			const isCurrent = isProfileDefault ? this.currentModel === undefined : this.currentModel === option.value;
			const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
			const label = isSelected ? theme.fg("accent", option.label) : option.label;
			const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
			const description = option.description ? theme.fg("muted", ` — ${option.description}`) : "";
			this.listContainer.addChild(new Text(`${prefix}${label}${checkmark}${description}`, 0, 0));
		}

		if (startIndex > 0 || endIndex < options.length) {
			this.listContainer.addChild(
				new Text(theme.fg("muted", `  (${this.selectedIndex + 1}/${options.length})`), 0, 0),
			);
		}
		if (
			options.length === 0 ||
			(this.allowProfileDefault && options.length === 1 && this.filteredModels.length === 0)
		) {
			this.listContainer.addChild(new Text(theme.fg("muted", "  No matching models"), 0, 0));
		}
	}

	private selectCurrent(): void {
		const selected = this.options[this.selectedIndex];
		if (!selected) return;
		this.onSelect(selected.value === "profile default" ? undefined : selected.value);
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.up")) {
			const options = this.options;
			if (options.length === 0) return;
			this.selectedIndex = this.selectedIndex === 0 ? options.length - 1 : this.selectedIndex - 1;
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.down")) {
			const options = this.options;
			if (options.length === 0) return;
			this.selectedIndex = this.selectedIndex === options.length - 1 ? 0 : this.selectedIndex + 1;
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			this.selectCurrent();
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancel();
		} else {
			this.searchInput.handleInput(keyData);
			this.filterModels(this.searchInput.getValue());
		}
	}
}

class RoleDetailSubmenu extends Container {
	private settingsList: SettingsList;
	private model: string | undefined;
	private thinkingLevel: ThinkingLevel | undefined;
	private readonly role: RoleSettingsEntry;
	private readonly models: AgentSettingsModelOption[];
	private readonly availableThinkingLevels: ThinkingLevel[];
	private readonly onModelChange: (modelRef: string | undefined) => void;
	private readonly onThinkingLevelChange: (level: ThinkingLevel | undefined) => void;

	constructor(
		role: RoleSettingsEntry,
		models: AgentSettingsModelOption[],
		availableThinkingLevels: ThinkingLevel[],
		onModelChange: (modelRef: string | undefined) => void,
		onThinkingLevelChange: (level: ThinkingLevel | undefined) => void,
		onCancel: () => void,
	) {
		super();
		this.role = role;
		this.models = models;
		this.availableThinkingLevels = availableThinkingLevels;
		this.onModelChange = onModelChange;
		this.onThinkingLevelChange = onThinkingLevelChange;
		this.model = role.model;
		this.thinkingLevel = role.thinkingLevel;
		this.settingsList = new SettingsList(this.createItems(), 2, getSettingsListTheme(), () => undefined, onCancel, {
			enableSearch: false,
		});
		this.addChild(this.settingsList);
	}

	private modelValue(): string {
		if (this.model !== undefined) return this.model;
		return this.role.isMain ? "current default" : "profile default";
	}

	private thinkingValue(): string {
		if (this.thinkingLevel !== undefined) return this.thinkingLevel;
		return this.role.isMain ? "current default" : "profile default";
	}

	private createItems(): SettingItem[] {
		return [
			{
				id: "model",
				label: "Model",
				description: this.role.isMain ? "Model for the main session" : "Model override for this agent role",
				currentValue: this.modelValue(),
				submenu: (_currentValue, done) =>
					new RoleModelPickerSubmenu(
						this.models,
						this.model,
						!this.role.isMain,
						(modelRef) => {
							this.model = modelRef;
							this.onModelChange(modelRef);
							done(this.modelValue());
						},
						() => done(),
					),
			},
			{
				id: "thinking",
				label: "Thinking level",
				description: this.role.isMain
					? "Thinking level for the main session"
					: "Thinking override for this agent role",
				currentValue: this.thinkingValue(),
				submenu: (_currentValue, done) =>
					new SelectSubmenu(
						"Thinking Level",
						"Select reasoning depth for thinking-capable models",
						[
							...(this.role.isMain
								? []
								: [
										{
											value: "profile default",
											label: "profile default",
											description: "Use the agent profile default",
										},
									]),
							...this.availableThinkingLevels.map((level) => ({
								value: level,
								label: level,
								description: THINKING_DESCRIPTIONS[level],
							})),
						],
						this.thinkingValue(),
						(value) => {
							const level = value === "profile default" ? undefined : (value as ThinkingLevel);
							this.thinkingLevel = level;
							this.onThinkingLevelChange(level);
							done(this.thinkingValue());
						},
						() => done(),
					),
			},
		];
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

class RoleSettingsSubmenu extends Container {
	private settingsList: SettingsList;
	private readonly roles: RoleSettingsEntry[];
	private readonly models: AgentSettingsModelOption[];
	private readonly availableThinkingLevels: ThinkingLevel[];
	private readonly onMainModelChange: (modelRef: string) => void;
	private readonly onMainThinkingLevelChange: (level: ThinkingLevel) => void;
	private readonly onAgentModelChange: (agentName: string, modelRef: string | undefined) => void;
	private readonly onAgentThinkingLevelChange: (agentName: string, level: ThinkingLevel | undefined) => void;

	constructor(
		mainRole: RoleSettingsEntry,
		agents: RoleSettingsEntry[],
		models: AgentSettingsModelOption[],
		availableThinkingLevels: ThinkingLevel[],
		onMainModelChange: (modelRef: string) => void,
		onMainThinkingLevelChange: (level: ThinkingLevel) => void,
		onAgentModelChange: (agentName: string, modelRef: string | undefined) => void,
		onAgentThinkingLevelChange: (agentName: string, level: ThinkingLevel | undefined) => void,
		onCancel: () => void,
	) {
		super();
		this.roles = [mainRole, ...agents];
		this.models = models;
		this.availableThinkingLevels = availableThinkingLevels;
		this.onMainModelChange = onMainModelChange;
		this.onMainThinkingLevelChange = onMainThinkingLevelChange;
		this.onAgentModelChange = onAgentModelChange;
		this.onAgentThinkingLevelChange = onAgentThinkingLevelChange;
		const items: SettingItem[] = this.roles.map((role) => ({
			id: role.name,
			label: role.name,
			description: role.description ?? (role.isMain ? "Main session role" : "Agent role"),
			currentValue: `${role.model ?? (role.isMain ? "current" : "profile default")} / ${role.thinkingLevel ?? (role.isMain ? "current" : "profile default")}`,
			submenu: (_currentValue, done) =>
				new RoleDetailSubmenu(
					role,
					this.models,
					this.availableThinkingLevels,
					(modelRef) => {
						role.model = modelRef;
						if (role.isMain) {
							if (modelRef !== undefined) this.onMainModelChange(modelRef);
						} else {
							this.onAgentModelChange(role.name, modelRef);
						}
					},
					(level) => {
						role.thinkingLevel = level;
						if (role.isMain) {
							if (level !== undefined) this.onMainThinkingLevelChange(level);
						} else {
							this.onAgentThinkingLevelChange(role.name, level);
						}
					},
					() =>
						done(
							`${role.model ?? (role.isMain ? "current" : "profile default")} / ${role.thinkingLevel ?? (role.isMain ? "current" : "profile default")}`,
						),
				),
		}));

		this.settingsList = new SettingsList(
			items,
			Math.min(items.length, 10),
			getSettingsListTheme(),
			() => undefined,
			onCancel,
			{ enableSearch: true },
		);
		this.addChild(this.settingsList);
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

class SettingsCategorySubmenu extends Container {
	private settingsList: SettingsList;

	constructor(items: SettingItem[], onChange: (id: string, newValue: string) => void, onCancel: () => void) {
		super();
		this.settingsList = new SettingsList(
			items,
			Math.min(items.length, 10),
			getSettingsListTheme(),
			onChange,
			onCancel,
			{ enableSearch: true },
		);
		this.addChild(this.settingsList);
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

class SelectSubmenu extends Container {
	private selectList: SelectList;

	constructor(
		title: string,
		description: string,
		options: SelectItem[],
		currentValue: string,
		onSelect: (value: string) => void,
		onCancel: () => void,
		onSelectionChange?: (value: string) => void,
	) {
		super();

		// Title
		this.addChild(new Text(theme.bold(theme.fg("accent", title)), 0, 0));

		// Description
		if (description) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("muted", description), 0, 0));
		}

		// Spacer
		this.addChild(new Spacer(1));

		// Select list
		this.selectList = new SelectList(
			options,
			Math.min(options.length, 10),
			getSelectListTheme(),
			SETTINGS_SUBMENU_SELECT_LIST_LAYOUT,
		);

		// Pre-select current value
		const currentIndex = options.findIndex((o) => o.value === currentValue);
		if (currentIndex !== -1) {
			this.selectList.setSelectedIndex(currentIndex);
		}

		this.selectList.onSelect = (item) => {
			onSelect(item.value);
		};

		this.selectList.onCancel = onCancel;

		if (onSelectionChange) {
			this.selectList.onSelectionChange = (item) => {
				onSelectionChange(item.value);
			};
		}

		this.addChild(this.selectList);

		// Hint
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to select · Esc to go back"), 0, 0));
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}
}

/**
 * Main settings selector component.
 */
export class SettingsSelectorComponent extends Container {
	private settingsList: SettingsList;

	constructor(config: SettingsConfig, callbacks: SettingsCallbacks) {
		super();

		const followUpKey = keyDisplayText("app.message.followUp");

		const handleSettingChange = (id: string, newValue: string): void => {
			switch (id) {
				case "autocompact":
					callbacks.onAutoCompactChange(newValue === "true");
					break;
				case "skill-commands":
					callbacks.onEnableSkillCommandsChange(newValue === "true");
					break;
				case "steering-mode":
					callbacks.onSteeringModeChange(newValue as "all" | "one-at-a-time");
					break;
				case "follow-up-mode":
					callbacks.onFollowUpModeChange(newValue as "all" | "one-at-a-time");
					break;
				case "transport":
					callbacks.onTransportChange(newValue as Transport);
					break;
				case "http-idle-timeout": {
					const choice = HTTP_IDLE_TIMEOUT_CHOICES.find((item) => item.label === newValue);
					if (choice) {
						callbacks.onHttpIdleTimeoutMsChange(choice.timeoutMs);
					}
					break;
				}
				case "hide-thinking":
					callbacks.onHideThinkingBlockChange(newValue === "true");
					break;
				case "quiet-startup":
					callbacks.onQuietStartupChange(newValue === "true");
					break;
				case "show-hardware-cursor":
					callbacks.onShowHardwareCursorChange(newValue === "true");
					break;
			}
		};

		const modelSettings: SettingItem[] = [
			{
				id: "roles",
				label: "Roles",
				description: "Set model and thinking for Main and agent roles",
				currentValue: "configure",
				submenu: (_currentValue, done) =>
					new RoleSettingsSubmenu(
						{
							name: "Main",
							description: "Current main chat session",
							model: config.mainModel,
							thinkingLevel: config.thinkingLevel,
							isMain: true,
						},
						config.agentProfiles.map((profile) => ({
							...profile,
							model: config.agentModelOverrides[profile.name] ?? profile.model,
							thinkingLevel: config.agentThinkingLevelOverrides[profile.name] ?? profile.thinkingLevel,
						})),
						config.agentModelOptions,
						config.availableThinkingLevels,
						(modelRef) => callbacks.onMainModelChange(modelRef),
						(level) => callbacks.onThinkingLevelChange(level),
						(agentName, modelRef) => callbacks.onAgentModelOverrideChange(agentName, modelRef),
						(agentName, level) => callbacks.onAgentThinkingLevelOverrideChange(agentName, level),
						() => done(),
					),
			},
			{
				id: "hide-thinking",
				label: "Hide thinking",
				description: "Hide thinking blocks in assistant responses",
				currentValue: config.hideThinkingBlock ? "true" : "false",
				values: ["true", "false"],
			},
		];

		const interactionSettings: SettingItem[] = [
			{
				id: "autocompact",
				label: "Auto-compact",
				description: "Automatically compact context when it gets too large",
				currentValue: config.autoCompact ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "skill-commands",
				label: "Skill commands",
				description: "Register skills as /skill:name commands",
				currentValue: config.enableSkillCommands ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "steering-mode",
				label: "Steering mode",
				description:
					"Enter while streaming queues steering messages. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.",
				currentValue: config.steeringMode,
				values: ["one-at-a-time", "all"],
			},
			{
				id: "follow-up-mode",
				label: "Follow-up mode",
				description: `${followUpKey} queues follow-up messages until agent stops. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.`,
				currentValue: config.followUpMode,
				values: ["one-at-a-time", "all"],
			},
		];

		const appearanceSettings: SettingItem[] = [
			{
				id: "theme",
				label: "Theme",
				description: "Color theme for the interface",
				currentValue: config.currentTheme,
				submenu: (currentValue, done) =>
					new SelectSubmenu(
						"Theme",
						"Select color theme",
						config.availableThemes.map((t) => ({ value: t, label: t })),
						currentValue,
						(value) => {
							callbacks.onThemeChange(value);
							done(value);
						},
						() => {
							callbacks.onThemePreview?.(currentValue);
							done();
						},
						(value) => callbacks.onThemePreview?.(value),
					),
			},
			{
				id: "show-hardware-cursor",
				label: "Show hardware cursor",
				description: "Show the terminal cursor while still positioning it for IME support",
				currentValue: config.showHardwareCursor ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "quiet-startup",
				label: "Quiet startup",
				description: "Disable verbose printing at startup",
				currentValue: config.quietStartup ? "true" : "false",
				values: ["true", "false"],
			},
		];

		const networkSettings: SettingItem[] = [
			{
				id: "transport",
				label: "Transport",
				description: "Preferred transport for providers that support multiple transports",
				currentValue: config.transport,
				values: ["sse", "websocket", "websocket-cached", "auto"],
			},
			{
				id: "http-idle-timeout",
				label: "HTTP idle timeout",
				description:
					"Maximum idle gap while waiting for HTTP headers or body chunks. Disable for local models that pause longer than five minutes.",
				currentValue: formatHttpIdleTimeoutMs(config.httpIdleTimeoutMs),
				values: HTTP_IDLE_TIMEOUT_CHOICES.map((choice) => choice.label),
			},
		];

		const items: SettingItem[] = [
			{
				id: "model-thinking",
				label: "Model & thinking",
				description: "Default thinking and per-agent role models",
				currentValue: "open",
				submenu: (_currentValue, done) => new SettingsCategorySubmenu(modelSettings, handleSettingChange, done),
			},
			{
				id: "interaction",
				label: "Interaction",
				description: "Compaction, skill commands, steering, and follow-up behavior",
				currentValue: "open",
				submenu: (_currentValue, done) =>
					new SettingsCategorySubmenu(interactionSettings, handleSettingChange, done),
			},
			{
				id: "appearance",
				label: "Appearance & terminal",
				description: "Theme, editor, cursor, startup, and terminal display settings",
				currentValue: "open",
				submenu: (_currentValue, done) =>
					new SettingsCategorySubmenu(appearanceSettings, handleSettingChange, done),
			},
			{
				id: "network",
				label: "Network",
				description: "Transport and HTTP timeout settings",
				currentValue: "open",
				submenu: (_currentValue, done) => new SettingsCategorySubmenu(networkSettings, handleSettingChange, done),
			},
		];

		// Add borders
		this.addChild(new DynamicBorder());

		this.settingsList = new SettingsList(
			items,
			Math.min(items.length, 10),
			getSettingsListTheme(),
			() => undefined,
			callbacks.onCancel,
			{ enableSearch: true },
		);

		this.addChild(this.settingsList);
		this.addChild(new DynamicBorder());
	}

	getSettingsList(): SettingsList {
		return this.settingsList;
	}
}
