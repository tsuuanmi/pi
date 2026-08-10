import { readFileSync } from "node:fs";

export function getEnv(): NodeJS.ProcessEnv {
	if (process.platform !== "linux" || Object.keys(process.env).length > 0) {
		return process.env;
	}
	try {
		const data = readFileSync("/proc/self/environ", "utf-8");
		const env: NodeJS.ProcessEnv = {};
		for (const entry of data.split("\0")) {
			const index = entry.indexOf("=");
			if (index > 0) {
				env[entry.slice(0, index)] = entry.slice(index + 1);
			}
		}
		return env;
	} catch {
		return process.env;
	}
}
