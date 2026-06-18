import { spawn } from "node:child_process";

/**
 * Open a URL or file in the platform browser/default handler.
 *
 * This intentionally never invokes a shell, so launcher metacharacters in the
 * target cannot be re-parsed by a shell.
 */
export function openBrowser(target: string): void {
	const [cmd, args]: [string, string[]] = process.platform === "darwin" ? ["open", [target]] : ["xdg-open", [target]];

	// spawn reports launcher failures (for example, missing xdg-open) via an
	// error event. Browser launch is best-effort: callers still present the target
	// to the user, so keep the launcher failure from becoming a process crash.
	spawn(cmd, args, { stdio: "ignore", detached: true })
		.on("error", () => {})
		.unref();
}
