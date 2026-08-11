import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolvePath } from "@tsuuanmi/pi-agent/node";
import type { MutationTargets } from "#workflows/skills/deep-interview/mutation-targets";

function absolutePath(cwd: string, value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed === ".") return path.resolve(cwd);
	return resolvePath(trimmed, cwd, { normalizeUnicodeSpaces: true, stripAtPrefix: true });
}

function isPathWithin(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function hasWorkflowStateTarget(cwd: string, targets: MutationTargets): boolean {
	const root = path.resolve(cwd);
	return targets.paths.some((value) => {
		const target = absolutePath(cwd, value);
		if (!target) return false;
		const relative = path.relative(root, path.resolve(target));
		if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return false;
		return relative.split(path.sep)[0] === ".pi";
	});
}

function tempRoots(): string[] {
	const roots = new Set<string>();
	for (const value of [os.tmpdir(), process.env.TMPDIR, "/tmp", "/var/tmp", "/private/tmp", "/private/var/tmp"]) {
		const trimmed = value?.trim();
		if (trimmed) roots.add(path.resolve(trimmed));
	}
	return [...roots];
}

async function realpath(target: string): Promise<string> {
	try {
		return await fs.realpath(target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return target;
	}
}

async function canonicalPath(target: string): Promise<string> {
	const suffix: string[] = [];
	let current = target;
	for (;;) {
		try {
			const resolved = await fs.realpath(current);
			return suffix.length > 0 ? path.join(resolved, ...suffix.reverse()) : resolved;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			const parent = path.dirname(current);
			if (parent === current) throw new Error(`cannot resolve mutation target: ${target}`);
			suffix.push(path.basename(current));
			current = parent;
		}
	}
}

async function isNeutralTempPath(cwd: string, value: string): Promise<boolean> {
	const target = absolutePath(cwd, value);
	if (!target) return false;
	const cwdPath = path.resolve(cwd);
	if (isPathWithin(cwdPath, target) || !tempRoots().some((root) => isPathWithin(root, target))) return false;
	const canonicalTarget = await canonicalPath(target);
	if (isPathWithin(await realpath(cwdPath), canonicalTarget)) return false;
	const canonicalRoots = await Promise.all(tempRoots().map(realpath));
	return canonicalRoots.some((root) => isPathWithin(root, canonicalTarget));
}

export async function blockedMutationTargets(cwd: string, targets: MutationTargets): Promise<string[]> {
	const blocked: string[] = [];
	for (const value of targets.paths) {
		if (!(await isNeutralTempPath(cwd, value))) blocked.push(value);
	}
	return blocked;
}
