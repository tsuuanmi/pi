/**
 * TUI component for managing package resources (enable/disable)
 */

import {
	type Component,
	Container,
	DynamicBorder,
	type Focusable,
	rawKeyHint,
	Spacer,
	theme,
	truncateToWidth,
	visibleWidth,
} from "@tsuuanmi/pi-tui";
import type { ResolvedPaths } from "#pi/resources/types";
import type { SettingsManager } from "#pi/settings/settings-manager";
import { buildResourceGroups } from "./groups.ts";
import { ResourceList } from "./list.ts";
import { ResourceToggler } from "./toggle.ts";

class ConfigSelectorHeader implements Component {
	invalidate(): void {}

	render(width: number): string[] {
		const title = theme.bold("Resource Configuration");
		const sep = theme.fg("muted", " · ");
		const hint = rawKeyHint("space", "toggle") + sep + rawKeyHint("esc", "close");
		const hintWidth = visibleWidth(hint);
		const titleWidth = visibleWidth(title);
		const spacing = Math.max(1, width - titleWidth - hintWidth);

		return [
			truncateToWidth(`${title}${" ".repeat(spacing)}${hint}`, width, ""),
			theme.fg("muted", "Type to filter resources"),
		];
	}
}

export class ResourceSettingsComponent extends Container implements Focusable {
	private resourceList: ResourceList;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.resourceList.focused = value;
	}

	constructor(
		resolvedPaths: ResolvedPaths,
		settingsManager: SettingsManager,
		cwd: string,
		agentDir: string,
		onClose: () => void,
		onExit: () => void,
		requestRender: () => void,
		terminalHeight?: number,
	) {
		super();

		const groups = buildResourceGroups(resolvedPaths, agentDir);
		const resourceToggler = new ResourceToggler(settingsManager, cwd, agentDir);

		// Add header
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new ConfigSelectorHeader());
		this.addChild(new Spacer(1));

		// Resource list
		this.resourceList = new ResourceList(groups, resourceToggler, terminalHeight);
		this.resourceList.onCancel = onClose;
		this.resourceList.onExit = onExit;
		this.resourceList.onToggle = () => requestRender();
		this.addChild(this.resourceList);

		// Bottom border
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	getResourceList(): ResourceList {
		return this.resourceList;
	}
}
