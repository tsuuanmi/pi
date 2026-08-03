import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { getBinDir } from "#pi/loader/paths";

export interface ShellConfig {
	shell: string;
	args: string[];
}

function findBash(): string | null {
	try {
		const result = spawnSync("which", ["bash"], { encoding: "utf-8", timeout: 5000 });
		if (result.status === 0 && result.stdout) {
			const shell = result.stdout.trim().split(/\r?\n/)[0];
			if (shell) return shell;
		}
	} catch {
		// Ignore lookup failures and use the shell fallback.
	}
	return null;
}

/**
 * Resolve shell configuration from an optional explicit shell path.
 * Resolution order: explicit path, /bin/bash, bash on PATH, then sh.
 */
export function getShellConfig(shellPath?: string): ShellConfig {
	if (shellPath) {
		if (existsSync(shellPath)) {
			return { shell: shellPath, args: ["-c"] };
		}
		throw new Error(`Custom shell path not found: ${shellPath}`);
	}

	if (existsSync("/bin/bash")) {
		return { shell: "/bin/bash", args: ["-c"] };
	}

	const bash = findBash();
	if (bash) {
		return { shell: bash, args: ["-c"] };
	}

	return { shell: "sh", args: ["-c"] };
}

export function getShellEnv(): NodeJS.ProcessEnv {
	const binDir = getBinDir();
	const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const currentPath = process.env[pathKey] ?? "";
	const pathEntries = currentPath.split(delimiter).filter(Boolean);
	const updatedPath = pathEntries.includes(binDir)
		? currentPath
		: [binDir, currentPath].filter(Boolean).join(delimiter);

	return {
		...process.env,
		[pathKey]: updatedPath,
	};
}
