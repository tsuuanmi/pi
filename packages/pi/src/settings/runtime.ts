import { normalizePath } from "@tsuuanmi/pi-agent/node";
import type { SettingsStore } from "#pi/settings/store";
import type { TransportSetting } from "#pi/settings/types";

export class RuntimeSettings {
	private readonly store: SettingsStore;

	constructor(store: SettingsStore) {
		this.store = store;
	}

	getSessionDir(): string | undefined {
		const sessionDir = this.store.getSettings().sessionDir;
		return sessionDir ? normalizePath(sessionDir) : sessionDir;
	}

	getSteeringMode(): "all" | "one-at-a-time" {
		return this.store.getSettings().steeringMode ?? "one-at-a-time";
	}

	setSteeringMode(mode: "all" | "one-at-a-time"): void {
		this.store.updateGlobal("steeringMode", (settings) => {
			settings.steeringMode = mode;
		});
	}

	getFollowUpMode(): "all" | "one-at-a-time" {
		return this.store.getSettings().followUpMode ?? "one-at-a-time";
	}

	setFollowUpMode(mode: "all" | "one-at-a-time"): void {
		this.store.updateGlobal("followUpMode", (settings) => {
			settings.followUpMode = mode;
		});
	}

	getTheme(): string | undefined {
		return this.store.getSettings().theme;
	}

	setTheme(theme: string): void {
		this.store.updateGlobal("theme", (settings) => {
			settings.theme = theme;
		});
	}

	getTransport(): TransportSetting {
		return this.store.getSettings().transport ?? "auto";
	}

	setTransport(transport: TransportSetting): void {
		this.store.updateGlobal("transport", (settings) => {
			settings.transport = transport;
		});
	}

	getShellPath(): string | undefined {
		return this.store.getSettings().shellPath;
	}

	setShellPath(path: string | undefined): void {
		this.store.updateGlobal("shellPath", (settings) => {
			settings.shellPath = path;
		});
	}

	getShellCommandPrefix(): string | undefined {
		return this.store.getSettings().shellCommandPrefix;
	}

	setShellCommandPrefix(prefix: string | undefined): void {
		this.store.updateGlobal("shellCommandPrefix", (settings) => {
			settings.shellCommandPrefix = prefix;
		});
	}

	getNpmCommand(): string[] | undefined {
		const command = this.store.getSettings().npmCommand;
		return command ? [...command] : undefined;
	}

	setNpmCommand(command: string[] | undefined): void {
		this.store.updateGlobal("npmCommand", (settings) => {
			settings.npmCommand = command ? [...command] : undefined;
		});
	}

	getShowHardwareCursor(): boolean {
		return this.store.getSettings().showHardwareCursor ?? process.env.PI_HARDWARE_CURSOR === "1";
	}

	setShowHardwareCursor(enabled: boolean): void {
		this.store.updateGlobal("showHardwareCursor", (settings) => {
			settings.showHardwareCursor = enabled;
		});
	}
}
