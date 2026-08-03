import * as os from "node:os";
import * as path from "node:path";
import { type Container, LAYOUT_EDGE_X, LAYOUT_SECTION_GAP_Y, Spacer, Text, theme } from "@tsuuanmi/pi-tui";
import type { ExtensionRunner } from "#pi/extensions/index";
import type { ResourceDiagnostic } from "#pi/loader/resources";
import type { SourceInfo } from "#pi/package-manager/source-info";
import type { AgentSession } from "#pi/runtime/agent";
import { BUILTIN_SLASH_COMMANDS } from "#pi/skills/slash-commands";

export class ResourceDiagnosticsController {
	private readonly chatContainer: Container;
	private readonly getSession: () => AgentSession;

	private get session(): AgentSession {
		return this.getSession();
	}

	constructor(opts: { chatContainer: Container; getSession: () => AgentSession }) {
		this.chatContainer = opts.chatContainer;
		this.getSession = opts.getSession;
	}

	private getBuiltInCommandConflictDiagnostics(extensionRunner: ExtensionRunner): ResourceDiagnostic[] {
		const builtinNames = new Set(BUILTIN_SLASH_COMMANDS.map((command) => command.name));
		return extensionRunner
			.getRegisteredCommands()
			.filter((command) => builtinNames.has(command.name))
			.map((command) => ({
				type: "warning" as const,
				message:
					command.invocationName === command.name
						? `Extension command '/${command.name}' conflicts with built-in interactive command. Skipping in autocomplete.`
						: `Extension command '/${command.name}' conflicts with built-in interactive command. Available as '/${command.invocationName}'.`,
				path: command.sourceInfo.path,
			}));
	}

	private formatDisplayPath(resourcePath: string): string {
		const home = os.homedir();
		if (resourcePath.startsWith(home)) {
			return `~${resourcePath.slice(home.length)}`;
		}
		return resourcePath;
	}

	private getShortPath(fullPath: string, sourceInfo?: SourceInfo): string {
		const baseDir = sourceInfo?.baseDir;
		if (baseDir && this.isPackageSource(sourceInfo)) {
			const relativePath = path.relative(path.resolve(baseDir), path.resolve(fullPath));
			if (
				relativePath &&
				relativePath !== "." &&
				!relativePath.startsWith("..") &&
				!relativePath.startsWith(`..${path.sep}`) &&
				!path.isAbsolute(relativePath)
			) {
				return relativePath.replace(/\\/g, "/");
			}
		}

		const source = sourceInfo?.source ?? "";
		const npmMatch = fullPath.match(/node_modules\/@?[^/]+(?:\/[^/]+)?\/(.*)/);
		if (npmMatch && source.startsWith("npm:")) {
			return npmMatch[1]!;
		}

		const gitMatch = fullPath.match(/git\/[^/]+\/[^/]+\/(.*)/);
		if (gitMatch && source.startsWith("git:")) {
			return gitMatch[1]!;
		}

		return this.formatDisplayPath(fullPath);
	}

	private getDisplaySourceInfo(sourceInfo?: SourceInfo): { label: string; scopeLabel?: string } {
		const source = sourceInfo?.source ?? "local";
		const scope = sourceInfo?.scope ?? "project";
		if (source === "local") {
			if (scope === "user") return { label: "user" };
			if (scope === "project") return { label: "project" };
			if (scope === "temporary") return { label: "path", scopeLabel: "temp" };
			return { label: "path" };
		}

		if (source === "cli") {
			return { label: "path", scopeLabel: scope === "temporary" ? "temp" : undefined };
		}

		const scopeLabel =
			scope === "user" ? "user" : scope === "project" ? "project" : scope === "temporary" ? "temp" : undefined;
		return { label: source, scopeLabel };
	}

	private isPackageSource(sourceInfo?: SourceInfo): boolean {
		const source = sourceInfo?.source ?? "";
		return source.startsWith("npm:") || source.startsWith("git:");
	}

	private findSourceInfoForPath(resourcePath: string, sourceInfos: Map<string, SourceInfo>): SourceInfo | undefined {
		const exact = sourceInfos.get(resourcePath);
		if (exact) return exact;

		let current = resourcePath;
		while (current.includes("/")) {
			current = current.substring(0, current.lastIndexOf("/"));
			const parent = sourceInfos.get(current);
			if (parent) return parent;
		}

		return undefined;
	}

	private formatPathWithSource(resourcePath: string, sourceInfo?: SourceInfo): string {
		if (sourceInfo) {
			const shortPath = this.getShortPath(resourcePath, sourceInfo);
			const { label, scopeLabel } = this.getDisplaySourceInfo(sourceInfo);
			const labelText = scopeLabel ? `${label} (${scopeLabel})` : label;
			return `${labelText} ${shortPath}`;
		}
		return this.formatDisplayPath(resourcePath);
	}

	private formatDiagnostics(diagnostics: readonly ResourceDiagnostic[], sourceInfos: Map<string, SourceInfo>): string {
		const lines: string[] = [];
		const collisions = new Map<string, ResourceDiagnostic[]>();
		const otherDiagnostics: ResourceDiagnostic[] = [];

		for (const diagnostic of diagnostics) {
			if (diagnostic.type === "collision" && diagnostic.collision) {
				const list = collisions.get(diagnostic.collision.name) ?? [];
				list.push(diagnostic);
				collisions.set(diagnostic.collision.name, list);
			} else {
				otherDiagnostics.push(diagnostic);
			}
		}

		for (const [name, collisionList] of collisions) {
			const first = collisionList[0]?.collision;
			if (!first) continue;
			lines.push(theme.fg("warning", `  "${name}" collision:`));
			lines.push(
				theme.fg(
					"dim",
					`    ${theme.fg("success", "✓")} ${this.formatPathWithSource(first.winnerPath, this.findSourceInfoForPath(first.winnerPath, sourceInfos))}`,
				),
			);
			for (const diagnostic of collisionList) {
				if (diagnostic.collision) {
					lines.push(
						theme.fg(
							"dim",
							`    ${theme.fg("warning", "✗")} ${this.formatPathWithSource(diagnostic.collision.loserPath, this.findSourceInfoForPath(diagnostic.collision.loserPath, sourceInfos))} (skipped)`,
						),
					);
				}
			}
		}

		for (const diagnostic of otherDiagnostics) {
			const color = diagnostic.type === "error" ? "error" : "warning";
			if (diagnostic.path) {
				const formattedPath = this.formatPathWithSource(
					diagnostic.path,
					this.findSourceInfoForPath(diagnostic.path, sourceInfos),
				);
				lines.push(theme.fg(color, `  ${formattedPath}`));
				lines.push(theme.fg(color, `    ${diagnostic.message}`));
			} else {
				lines.push(theme.fg(color, `  ${diagnostic.message}`));
			}
		}

		return lines.join("\n");
	}

	showDiagnostics(): void {
		const skillsResult = this.session.resourceLoader.getSkills();
		const promptsResult = this.session.resourceLoader.getPrompts();
		const themesResult = this.session.resourceLoader.getThemes();
		const extensions = this.session.resourceLoader.getExtensions().extensions;
		const sourceInfos = new Map<string, SourceInfo>();

		for (const extension of extensions) {
			if (extension.sourceInfo) {
				sourceInfos.set(extension.path, extension.sourceInfo);
			}
		}
		for (const skill of skillsResult.skills) {
			if (skill.sourceInfo) {
				sourceInfos.set(skill.filePath, skill.sourceInfo);
			}
		}
		for (const prompt of promptsResult.prompts) {
			if (prompt.sourceInfo) {
				sourceInfos.set(prompt.filePath, prompt.sourceInfo);
			}
		}
		for (const loadedTheme of themesResult.themes) {
			if (loadedTheme.sourcePath && loadedTheme.sourceInfo) {
				sourceInfos.set(loadedTheme.sourcePath, loadedTheme.sourceInfo);
			}
		}

		const addDiagnostics = (title: string, diagnostics: readonly ResourceDiagnostic[]): void => {
			if (diagnostics.length === 0) return;
			const warningLines = this.formatDiagnostics(diagnostics, sourceInfos);
			this.chatContainer.addChild(
				new Text(`${theme.fg("warning", `[${title}]`)}\n${warningLines}`, LAYOUT_EDGE_X, 0),
			);
			this.chatContainer.addChild(new Spacer(LAYOUT_SECTION_GAP_Y));
		};

		addDiagnostics("Skill conflicts", skillsResult.diagnostics);
		addDiagnostics("Prompt conflicts", promptsResult.diagnostics);

		const extensionDiagnostics: ResourceDiagnostic[] = this.session.resourceLoader
			.getExtensions()
			.errors.map((error) => ({ type: "error", message: error.error, path: error.path }));
		extensionDiagnostics.push(...this.session.extensionRunner.getCommandDiagnostics());
		extensionDiagnostics.push(...this.getBuiltInCommandConflictDiagnostics(this.session.extensionRunner));
		extensionDiagnostics.push(...this.session.extensionRunner.getShortcutDiagnostics());
		addDiagnostics("Extension issues", extensionDiagnostics);

		addDiagnostics("Theme conflicts", themesResult.diagnostics);
	}
}
