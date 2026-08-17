import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface RuntimeManifest {
	schemaVersion: 1;
	appVersion: string;
	platform: "linux" | "darwin";
	arch: "x64" | "arm64";
	launcher: string;
}

export interface DaemonRuntime {
	root: string;
	launcher: string;
	manifest: RuntimeManifest;
}

export interface ResolveDaemonRuntimeOptions {
	platform?: NodeJS.Platform;
	arch?: string;
	moduleUrl?: string;
}

function parseRuntimeManifest(value: unknown): RuntimeManifest {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid bundled daemon manifest.");
	const manifest = value as Record<string, unknown>;
	if (
		manifest.schemaVersion !== 1 ||
		typeof manifest.appVersion !== "string" ||
		(manifest.platform !== "linux" && manifest.platform !== "darwin") ||
		(manifest.arch !== "x64" && manifest.arch !== "arm64") ||
		typeof manifest.launcher !== "string" ||
		manifest.launcher === "" ||
		isAbsolute(manifest.launcher)
	) {
		throw new Error("Invalid bundled daemon manifest.");
	}
	return manifest as unknown as RuntimeManifest;
}

export async function resolveDaemonRuntime(options: ResolveDaemonRuntimeOptions = {}): Promise<DaemonRuntime> {
	const platform = options.platform ?? process.platform;
	const arch = options.arch ?? process.arch;
	if (platform !== "linux" && platform !== "darwin") {
		throw new Error(`The bundled browser daemon supports Linux and macOS only, received ${platform}.`);
	}
	if (arch !== "x64" && arch !== "arm64") {
		throw new Error(`The bundled browser daemon does not support ${platform}-${arch}.`);
	}
	const modulePath = fileURLToPath(options.moduleUrl ?? import.meta.url);
	const root = resolve(dirname(modulePath), "runtime");
	const manifest = parseRuntimeManifest(JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")));
	if (manifest.platform !== platform || manifest.arch !== arch) {
		throw new Error(`Bundled browser daemon does not support ${platform}-${arch}.`);
	}
	const launcher = resolve(root, manifest.launcher);
	const launcherRelative = relative(root, launcher);
	if (launcherRelative === "" || launcherRelative.startsWith("..") || isAbsolute(launcherRelative)) {
		throw new Error("Bundled daemon launcher escapes its runtime directory.");
	}
	await access(launcher, constants.X_OK);
	return { root, launcher, manifest };
}
