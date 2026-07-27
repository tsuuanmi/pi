import type { ProviderEnv } from "#ai/protocol/options";

export function getProviderEnvValue(name: string, env?: ProviderEnv): string | undefined {
	return env?.[name] || (typeof process !== "undefined" ? process.env[name] : undefined) || undefined;
}

export function mergeHeaderSources(
	...headerSources: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
	const merged: Record<string, string> = {};
	for (const headers of headerSources) {
		if (headers) {
			Object.assign(merged, headers);
		}
	}
	return Object.keys(merged).length > 0 ? merged : undefined;
}
