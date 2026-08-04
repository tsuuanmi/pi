import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export interface ShellConfig {
	shell: string;
	args: string[];
}

function isExecutable(path: string): boolean {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function findBash(): string | undefined {
	const path = process.env.PATH ?? "";
	for (const directory of path.split(delimiter)) {
		if (!directory) continue;
		const candidate = join(directory, "bash");
		if (isExecutable(candidate)) return candidate;
	}
	return undefined;
}

export function resolveShell(shellPath?: string): ShellConfig {
	if (shellPath !== undefined) {
		if (!isExecutable(shellPath)) throw new Error(`Shell is not executable: ${shellPath}`);
		return { shell: shellPath, args: ["-c"] };
	}

	if (isExecutable("/bin/bash")) return { shell: "/bin/bash", args: ["-c"] };
	const bash = findBash();
	if (bash !== undefined) return { shell: bash, args: ["-c"] };
	throw new Error("Bash shell not found");
}
