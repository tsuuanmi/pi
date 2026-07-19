import type { KnownProvider, ProviderEnv } from "#ai/types";

let procEnvCache: Map<string, string> | null = null;

/**
 * Fallback for https://github.com/oven-sh/bun/issues/27802.
 * Bun compiled binaries can expose an empty process.env inside Linux sandboxes
 * even though /proc/self/environ contains the environment.
 *
 * This intentionally duplicates restoreSandboxEnv() in
 * packages/pi/src/bun/restore-sandbox-env.ts. The ai package can be
 * used directly, without going through that entrypoint, so provider env lookup
 * must not depend on process.env having been patched.
 */
function getBunSandboxEnvValue(name: string): string | undefined {
	if (typeof process === "undefined" || !process.versions?.bun || Object.keys(process.env).length > 0) {
		return undefined;
	}

	if (procEnvCache === null) {
		procEnvCache = new Map();
		try {
			const { readFileSync } = require("node:fs") as {
				readFileSync(path: string, encoding: BufferEncoding): string;
			};
			const data = readFileSync("/proc/self/environ", "utf-8");
			for (const entry of data.split("\0")) {
				const idx = entry.indexOf("=");
				if (idx > 0) {
					procEnvCache.set(entry.slice(0, idx), entry.slice(idx + 1));
				}
			}
		} catch {
			// /proc/self/environ may not exist or may not be readable.
		}
	}

	return procEnvCache.get(name);
}

/**
 * Resolve a provider env value from scoped overrides, normal process.env, then
 * the duplicated Bun sandbox fallback for direct pi-ai consumers.
 */
export function getProviderEnvValue(name: string, env?: ProviderEnv): string | undefined {
	return (
		env?.[name] ||
		(typeof process !== "undefined" ? process.env[name] : undefined) ||
		getBunSandboxEnvValue(name) ||
		undefined
	);
}

function getApiKeyEnvVars(provider: string): readonly string[] | undefined {
	// ANTHROPIC_OAUTH_TOKEN takes precedence over ANTHROPIC_API_KEY
	if (provider === "anthropic") {
		return ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];
	}

	const envMap: Record<string, string> = {
		openai: "OPENAI_API_KEY",
	};

	const envVar = envMap[provider];
	return envVar ? [envVar] : undefined;
}

/**
 * Find configured environment variables that can provide an API key for a provider.
 */
export function findEnvKeys(provider: KnownProvider, env?: ProviderEnv): string[] | undefined;
export function findEnvKeys(provider: string, env?: ProviderEnv): string[] | undefined;
export function findEnvKeys(provider: string, env?: ProviderEnv): string[] | undefined {
	const envVars = getApiKeyEnvVars(provider);
	if (!envVars) return undefined;

	const found = envVars.filter((envVar) => !!getProviderEnvValue(envVar, env));
	return found.length > 0 ? found : undefined;
}

/**
 * Get API key for provider from known environment variables, e.g. OPENAI_API_KEY.
 *
 * Will not return API keys for providers that require OAuth tokens.
 */
export function getEnvApiKey(provider: KnownProvider, env?: ProviderEnv): string | undefined;
export function getEnvApiKey(provider: string, env?: ProviderEnv): string | undefined;
export function getEnvApiKey(provider: string, env?: ProviderEnv): string | undefined {
	const envKeys = findEnvKeys(provider, env);
	return envKeys?.[0] ? getProviderEnvValue(envKeys[0], env) : undefined;
}
