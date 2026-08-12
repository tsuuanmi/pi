import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface RuntimeManifest {
	schemaVersion: 1;
	appVersion: string;
	platform: string;
	arch: string;
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

export async function resolveDaemonRuntime(options: ResolveDaemonRuntimeOptions = {}): Promise<DaemonRuntime> {
	const platform = options.platform ?? process.platform;
	const arch = options.arch ?? process.arch;
	if (platform !== "linux")
		throw new Error(`The bundled ChatGPT Web daemon currently supports Linux only, received ${platform}.`);
	const modulePath = fileURLToPath(options.moduleUrl ?? import.meta.url);
	const root = resolve(dirname(modulePath), "runtime");
	const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as RuntimeManifest;
	if (manifest.schemaVersion !== 1 || manifest.platform !== platform || manifest.arch !== arch) {
		throw new Error(`Bundled ChatGPT Web daemon does not support ${platform}-${arch}.`);
	}
	const launcher = join(root, manifest.launcher);
	await access(launcher, constants.X_OK);
	return { root, launcher, manifest };
}
