/**
 * Persists resource enable/disable changes.
 */

import { dirname, join, relative } from "node:path";
import { CONFIG_DIR_NAME } from "#pi/loader/app";
import type { SettingsManager } from "#pi/settings/manager";
import type { PackageSource } from "#pi/settings/types";
import type { ResourceItem } from "./groups.ts";

export class ResourceToggler {
	private readonly settingsManager: SettingsManager;
	private readonly cwd: string;
	private readonly agentDir: string;

	constructor(settingsManager: SettingsManager, cwd: string, agentDir: string) {
		this.settingsManager = settingsManager;
		this.cwd = cwd;
		this.agentDir = agentDir;
	}

	toggle(item: ResourceItem, enabled: boolean): void {
		if (item.metadata.origin === "top-level") {
			this.toggleTopLevelResource(item, enabled);
		} else {
			this.togglePackageResource(item, enabled);
		}
	}

	private toggleTopLevelResource(item: ResourceItem, enabled: boolean): void {
		const scope = item.metadata.scope as "user" | "project";
		const settings =
			scope === "project" ? this.settingsManager.getProjectSettings() : this.settingsManager.getGlobalSettings();

		const arrayKey = item.resourceType as "extensions" | "skills" | "prompts" | "themes";
		const current = (settings[arrayKey] ?? []) as string[];

		// Generate pattern for this resource
		const pattern = this.getResourcePattern(item);
		const disablePattern = `-${pattern}`;
		const enablePattern = `+${pattern}`;

		// Filter out existing patterns for this resource
		const updated = current.filter((p) => {
			const stripped = p.startsWith("!") || p.startsWith("+") || p.startsWith("-") ? p.slice(1) : p;
			return stripped !== pattern;
		});

		if (enabled) {
			updated.push(enablePattern);
		} else {
			updated.push(disablePattern);
		}

		if (scope === "project") {
			if (arrayKey === "extensions") {
				this.settingsManager.setProjectExtensionPaths(updated);
			} else if (arrayKey === "skills") {
				this.settingsManager.setProjectSkillPaths(updated);
			} else if (arrayKey === "prompts") {
				this.settingsManager.setProjectPromptTemplatePaths(updated);
			} else if (arrayKey === "themes") {
				this.settingsManager.setProjectThemePaths(updated);
			}
		} else {
			if (arrayKey === "extensions") {
				this.settingsManager.setExtensionPaths(updated);
			} else if (arrayKey === "skills") {
				this.settingsManager.setSkillPaths(updated);
			} else if (arrayKey === "prompts") {
				this.settingsManager.setPromptTemplatePaths(updated);
			} else if (arrayKey === "themes") {
				this.settingsManager.setThemePaths(updated);
			}
		}
	}

	private togglePackageResource(item: ResourceItem, enabled: boolean): void {
		const scope = item.metadata.scope as "user" | "project";
		const settings =
			scope === "project" ? this.settingsManager.getProjectSettings() : this.settingsManager.getGlobalSettings();

		const packages = [...(settings.packages ?? [])] as PackageSource[];
		const pkgIndex = packages.findIndex((pkg) => {
			const source = typeof pkg === "string" ? pkg : pkg.source;
			return source === item.metadata.source;
		});

		if (pkgIndex === -1) return;

		let pkg = packages[pkgIndex];

		// Convert string to object form if needed
		if (typeof pkg === "string") {
			pkg = { source: pkg };
			packages[pkgIndex] = pkg;
		}

		// Get the resource array for this type
		const arrayKey = item.resourceType as "extensions" | "skills" | "prompts" | "themes";
		const current = (pkg[arrayKey] ?? []) as string[];

		// Generate pattern relative to package root
		const pattern = this.getPackageResourcePattern(item);
		const disablePattern = `-${pattern}`;
		const enablePattern = `+${pattern}`;

		// Filter out existing patterns for this resource
		const updated = current.filter((p) => {
			const stripped = p.startsWith("!") || p.startsWith("+") || p.startsWith("-") ? p.slice(1) : p;
			return stripped !== pattern;
		});

		if (enabled) {
			updated.push(enablePattern);
		} else {
			updated.push(disablePattern);
		}

		(pkg as Record<string, unknown>)[arrayKey] = updated.length > 0 ? updated : undefined;

		// Clean up empty filter object
		const hasFilters = ["extensions", "skills", "prompts", "themes"].some(
			(k) => (pkg as Record<string, unknown>)[k] !== undefined,
		);
		if (!hasFilters) {
			packages[pkgIndex] = (pkg as { source: string }).source;
		}

		if (scope === "project") {
			this.settingsManager.setProjectPackages(packages);
		} else {
			this.settingsManager.setPackages(packages);
		}
	}

	private getTopLevelBaseDir(scope: "user" | "project"): string {
		return scope === "project" ? join(this.cwd, CONFIG_DIR_NAME) : this.agentDir;
	}

	private getResourcePattern(item: ResourceItem): string {
		const scope = item.metadata.scope as "user" | "project";
		const baseDir = item.metadata.baseDir ?? this.getTopLevelBaseDir(scope);
		return relative(baseDir, item.path);
	}

	private getPackageResourcePattern(item: ResourceItem): string {
		const baseDir = item.metadata.baseDir ?? dirname(item.path);
		return relative(baseDir, item.path);
	}
}
