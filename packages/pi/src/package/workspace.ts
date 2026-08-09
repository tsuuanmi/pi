import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { markPathIgnoredByCloudSync } from "@tsuuanmi/pi-agent/node";

export function ensureGitIgnore(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const ignorePath = join(dir, ".gitignore");
	if (!existsSync(ignorePath)) {
		writeFileSync(ignorePath, "*\n!.gitignore\n", "utf-8");
	}
}

export function ensureNpmProject(root: string): void {
	if (!existsSync(root)) {
		mkdirSync(root, { recursive: true });
	}
	markPathIgnoredByCloudSync(root);
	ensureGitIgnore(root);

	const packageJsonPath = join(root, "package.json");
	if (!existsSync(packageJsonPath)) {
		writeFileSync(packageJsonPath, JSON.stringify({ name: "pi-extensions", private: true }, null, 2), "utf-8");
	}
}

export function pruneEmptyParents(target: string, root: string | undefined): void {
	if (!root) return;

	const resolvedRoot = resolve(root);
	let current = dirname(target);
	while (current === resolvedRoot || current.startsWith(`${resolvedRoot}${sep}`)) {
		if (current === resolvedRoot) break;
		if (!existsSync(current)) {
			current = dirname(current);
			continue;
		}
		if (readdirSync(current).length > 0) break;
		try {
			rmSync(current, { recursive: true, force: true });
		} catch {
			break;
		}
		current = dirname(current);
	}
}
