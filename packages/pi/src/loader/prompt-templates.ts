import { resolvePath } from "@tsuuanmi/pi-agent/node";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, dirname, join, resolve, sep } from "path";
import { CONFIG_DIR_NAME } from "#pi/loader/app";
import { parseFrontmatter } from "#pi/loader/frontmatter";
import type { ResourceDiagnostic } from "#pi/resources/diagnostics";
import { createSourceInfo, createSyntheticSourceInfo, type SourceInfo } from "#pi/resources/source-info";
import type { ResolvedResource } from "#pi/resources/types";

/**
 * Represents a prompt template loaded from a markdown file
 */
export interface PromptTemplate {
	name: string;
	description: string;
	argumentHint?: string;
	content: string;
	sourceInfo: SourceInfo;
	filePath: string; // Absolute path to the template file
}

function loadTemplateFromFileResult(
	filePath: string,
	sourceInfo: SourceInfo,
): { template: PromptTemplate | null; diagnostics: ResourceDiagnostic[] } {
	try {
		const rawContent = readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(rawContent);

		const name = basename(filePath).replace(/\.md$/, "");

		// Get description from frontmatter or first non-empty line
		let description = frontmatter.description || "";
		if (!description) {
			const firstLine = body.split("\n").find((line) => line.trim());
			if (firstLine) {
				// Truncate if too long
				description = firstLine.slice(0, 60);
				if (firstLine.length > 60) description += "...";
			}
		}

		return {
			template: {
				name,
				description,
				...(frontmatter["argument-hint"] && { argumentHint: frontmatter["argument-hint"] }),
				content: body,
				sourceInfo,
				filePath,
			},
			diagnostics: [],
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to parse prompt template";
		return { template: null, diagnostics: [{ type: "warning", message, path: filePath }] };
	}
}

/**
 * Scan a directory for .md files (non-recursive) and load them as prompt templates.
 */
function loadTemplatesFromDir(
	dir: string,
	getSourceInfo: (filePath: string) => SourceInfo,
): { templates: PromptTemplate[]; diagnostics: ResourceDiagnostic[] } {
	const templates: PromptTemplate[] = [];
	const diagnostics: ResourceDiagnostic[] = [];

	if (!existsSync(dir)) {
		return { templates, diagnostics };
	}

	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			// For symlinks, check if they point to a file
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					const stats = statSync(fullPath);
					isFile = stats.isFile();
				} catch {
					// Broken symlink, skip it
					continue;
				}
			}

			if (isFile && entry.name.endsWith(".md")) {
				const result = loadTemplateFromFileResult(fullPath, getSourceInfo(fullPath));
				if (result.template) {
					templates.push(result.template);
				}
				diagnostics.push(...result.diagnostics);
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to read prompt templates directory";
		diagnostics.push({ type: "warning", message, path: dir });
	}

	return { templates, diagnostics };
}

export interface LoadPromptTemplatesResult {
	prompts: PromptTemplate[];
	diagnostics: ResourceDiagnostic[];
}

export interface LoadPromptTemplatesOptions {
	/** Working directory for project-local templates. */
	cwd: string;
	/** Agent config directory for global templates. */
	agentDir: string;
	/** Resolved prompt template resources. */
	promptResources: ResolvedResource[];
	/** Include default prompt directories. */
	includeDefaults: boolean;
}

/**
 * Load all prompt templates from:
 * 1. Global: agentDir/prompts/
 * 2. Project: cwd/{CONFIG_DIR_NAME}/prompts/
 * 3. Explicit prompt paths
 */
export function loadPromptTemplatesWithDiagnostics(options: LoadPromptTemplatesOptions): LoadPromptTemplatesResult {
	const resolvedCwd = resolvePath(options.cwd);
	const resolvedAgentDir = resolvePath(options.agentDir);
	const { promptResources, includeDefaults } = options;

	const templates: PromptTemplate[] = [];
	const diagnostics: ResourceDiagnostic[] = [];

	const globalPromptsDir = join(resolvedAgentDir, "prompts");
	const projectPromptsDir = resolve(resolvedCwd, CONFIG_DIR_NAME, "prompts");

	const isUnderPath = (target: string, root: string): boolean => {
		const normalizedRoot = resolve(root);
		if (target === normalizedRoot) {
			return true;
		}
		const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
		return target.startsWith(prefix);
	};

	const getSourceInfo = (resolvedPath: string): SourceInfo => {
		if (isUnderPath(resolvedPath, globalPromptsDir)) {
			return createSyntheticSourceInfo(resolvedPath, {
				source: "local",
				scope: "user",
				baseDir: globalPromptsDir,
			});
		}
		if (isUnderPath(resolvedPath, projectPromptsDir)) {
			return createSyntheticSourceInfo(resolvedPath, {
				source: "local",
				scope: "project",
				baseDir: projectPromptsDir,
			});
		}
		return createSyntheticSourceInfo(resolvedPath, {
			source: "local",
			baseDir: statSync(resolvedPath).isDirectory() ? resolvedPath : dirname(resolvedPath),
		});
	};

	if (includeDefaults) {
		const globalResult = loadTemplatesFromDir(globalPromptsDir, getSourceInfo);
		templates.push(...globalResult.templates);
		diagnostics.push(...globalResult.diagnostics);
		const projectResult = loadTemplatesFromDir(projectPromptsDir, getSourceInfo);
		templates.push(...projectResult.templates);
		diagnostics.push(...projectResult.diagnostics);
	}

	// 3. Load explicit prompt resources
	for (const resource of promptResources) {
		const resolvedPath = resolvePath(resource.path, resolvedCwd, { trim: true });
		if (!existsSync(resolvedPath)) {
			diagnostics.push({ type: "warning", message: "prompt template path does not exist", path: resolvedPath });
			continue;
		}

		try {
			const stats = statSync(resolvedPath);
			const sourceInfo = (filePath: string) =>
				createSourceInfo(filePath, {
					...resource.metadata,
					baseDir: resource.metadata.baseDir ?? (stats.isDirectory() ? resolvedPath : dirname(resolvedPath)),
				});
			if (stats.isDirectory()) {
				const result = loadTemplatesFromDir(resolvedPath, sourceInfo);
				templates.push(...result.templates);
				diagnostics.push(...result.diagnostics);
			} else if (stats.isFile() && resolvedPath.endsWith(".md")) {
				const result = loadTemplateFromFileResult(resolvedPath, sourceInfo(resolvedPath));
				if (result.template) {
					templates.push(result.template);
				}
				diagnostics.push(...result.diagnostics);
			} else {
				diagnostics.push({
					type: "warning",
					message: "prompt template path is not a markdown file",
					path: resolvedPath,
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to read prompt template path";
			diagnostics.push({ type: "warning", message, path: resolvedPath });
		}
	}

	return { prompts: templates, diagnostics };
}

export function loadPromptTemplates(options: LoadPromptTemplatesOptions): PromptTemplate[] {
	return loadPromptTemplatesWithDiagnostics(options).prompts;
}
