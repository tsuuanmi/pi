import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { canonicalizePath, resolvePath } from "@tsuuanmi/pi-agent/node";
import chalk from "chalk";

type ContextFile = {
	path: string;
	content: string;
};

const STANDARD_AGENT_DIRS = [".agent", ".agents"] as const;

export function loadProjectContextFiles(options: { cwd: string; agentDir: string }): ContextFile[] {
	const cwd = resolvePath(options.cwd);
	const agentDir = resolvePath(options.agentDir);
	const homeDir = resolvePath(getHomeDir());
	const files: ContextFile[] = [];
	const seen = new Set<string>();

	addFile(files, seen, loadContextFile(agentDir));
	for (const dir of standardAgentDirs(homeDir)) {
		addFile(files, seen, loadTextFile(join(dir, "AGENTS.md")));
		for (const rule of loadRules(join(dir, "rules"))) addFile(files, seen, rule);
	}

	const ancestorFiles: ContextFile[] = [];
	let currentDir = cwd;
	const root = resolve("/");

	while (true) {
		const discovered: ContextFile[] = [];
		const contextFile = loadContextFile(currentDir);
		if (contextFile) discovered.push(contextFile);
		if (currentDir !== homeDir) {
			for (const dir of standardAgentDirs(currentDir)) {
				const standardContext = loadTextFile(join(dir, "AGENTS.md"));
				if (standardContext) discovered.push(standardContext);
				discovered.push(...loadRules(join(dir, "rules")));
			}
		}

		for (let index = discovered.length - 1; index >= 0; index--) {
			const file = discovered[index]!;
			const key = canonicalizePath(file.path);
			if (!seen.has(key)) {
				ancestorFiles.unshift(file);
				seen.add(key);
			}
		}

		if (currentDir === root) break;
		const parentDir = resolve(currentDir, "..");
		if (parentDir === currentDir) break;
		currentDir = parentDir;
	}

	files.push(...ancestorFiles);
	return files;
}

function getHomeDir(): string {
	return process.env.HOME || homedir();
}

function standardAgentDirs(baseDir: string): string[] {
	return STANDARD_AGENT_DIRS.map((name) => join(baseDir, name));
}

function loadContextFile(dir: string): ContextFile | null {
	for (const name of ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"]) {
		const file = join(dir, name);
		if (!existsSync(file)) continue;
		try {
			return { path: file, content: readFileSync(file, "utf-8") };
		} catch (error) {
			console.error(chalk.yellow(`Warning: Could not read ${file}: ${error}`));
			return null;
		}
	}
	return null;
}

function loadTextFile(file: string): ContextFile | null {
	if (!existsSync(file)) return null;
	try {
		return { path: file, content: readFileSync(file, "utf-8") };
	} catch (error) {
		console.error(chalk.yellow(`Warning: Could not read ${file}: ${error}`));
		return null;
	}
}

function loadRules(dir: string): ContextFile[] {
	if (!existsSync(dir)) return [];
	const files: ContextFile[] = [];
	try {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const file = join(dir, entry.name);
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					isFile = statSync(file).isFile();
				} catch {
					continue;
				}
			}
			if (!isFile || (!entry.name.endsWith(".md") && !entry.name.endsWith(".mdc"))) continue;
			const rule = loadTextFile(file);
			if (rule) files.push(rule);
		}
	} catch (error) {
		console.error(chalk.yellow(`Warning: Could not read rules directory ${dir}: ${error}`));
	}
	return files;
}

function addFile(files: ContextFile[], seen: Set<string>, file: ContextFile | null): void {
	if (!file) return;
	const key = canonicalizePath(file.path);
	if (seen.has(key)) return;
	files.push(file);
	seen.add(key);
}
