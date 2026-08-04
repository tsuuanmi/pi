import { delimiter } from "node:path";
import { resolveShell } from "@tsuuanmi/pi-agent/node";
import { getBinDir } from "#pi/loader/paths";

export { resolveShell };

export function getShellEnv(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const env = { ...process.env, ...overrides };
	const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const pathValue = env[pathKey] ?? "";
	const entries = pathValue.split(delimiter).filter(Boolean);
	const binDir = getBinDir();
	if (!entries.includes(binDir)) entries.unshift(binDir);
	return { ...env, [pathKey]: entries.join(delimiter) };
}
