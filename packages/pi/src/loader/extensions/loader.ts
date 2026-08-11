/**
 * Extension loader - loads TypeScript extension modules using jiti.
 *
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePath } from "@tsuuanmi/pi-agent/node";
import { createJiti } from "jiti/static";
import type { Extension, ExtensionFactory, ExtensionRuntime, LoadExtensionsResult } from "#pi/api/extension-types";
import { createEventBus, type EventBus } from "#pi/hooks/event-bus";
import { CONFIG_DIR_NAME } from "#pi/loader/app";
import { getAgentDir } from "#pi/loader/paths";
import { collectAutoExtensionEntries } from "#pi/resources/discovery";
import { createSourceInfo } from "#pi/resources/source-info";
import type { PathMetadata, ResolvedResource } from "#pi/resources/types";
import { createExtensionAPI, createExtensionRuntime } from "#pi/runtime/extensions/api";

const require = createRequire(import.meta.url);

function getBundledPackageAliases(packagesDir: string): Record<string, string> {
	if (!fs.existsSync(packagesDir)) return {};
	const aliases: Record<string, string> = {};
	for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const packageDir = path.join(packagesDir, entry.name);
		const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")) as {
			name?: unknown;
			main?: unknown;
		};
		if (typeof manifest.name !== "string" || typeof manifest.main !== "string") continue;
		aliases[manifest.name] = path.resolve(packageDir, manifest.main);
	}
	return aliases;
}

/** Get aliases for jiti extension imports. */
let _aliases: Record<string, string> | null = null;

function getAliases(): Record<string, string> {
	if (_aliases) return _aliases;

	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const packageIndex = path.resolve(__dirname, "..", "..", "index.js");
	const bundledPackageAliases = getBundledPackageAliases(path.resolve(__dirname, "..", "..", "packages"));

	const typeboxEntry = require.resolve("typebox");
	const typeboxCompileEntry = require.resolve("typebox/compile");
	const typeboxValueEntry = require.resolve("typebox/value");

	const resolvePackageEntry = (specifier: string): string => {
		const resolve = require.resolve as unknown as (module: string, options: { conditions: Set<string> }) => string;
		return resolve(specifier, { conditions: new Set(["node", "import"]) });
	};

	const piEntry = packageIndex;
	const piExtensionsEntry = path.resolve(__dirname, "index.js");
	const piConfigEntry = path.resolve(__dirname, "..", "config.js");
	const piAgentEntry = resolvePackageEntry("@tsuuanmi/pi-agent");
	const piAgentNodeEntry = resolvePackageEntry("@tsuuanmi/pi-agent/node");
	const piTuiEntry = resolvePackageEntry("@tsuuanmi/pi-tui");
	const piAiEntry = resolvePackageEntry("@tsuuanmi/pi-ai");
	const piAiOauthEntry = resolvePackageEntry("@tsuuanmi/pi-ai/oauth");

	_aliases = {
		...bundledPackageAliases,
		"@tsuuanmi/pi/extensions": piExtensionsEntry,
		"@tsuuanmi/pi/loader/config": piConfigEntry,
		"@tsuuanmi/pi": piEntry,
		"@tsuuanmi/pi-agent/node": piAgentNodeEntry,
		"@tsuuanmi/pi-agent": piAgentEntry,
		"@tsuuanmi/pi-tui": piTuiEntry,
		"@tsuuanmi/pi-ai": piAiEntry,
		"@tsuuanmi/pi-ai/oauth": piAiOauthEntry,
		typebox: typeboxEntry,
		"typebox/compile": typeboxCompileEntry,
		"typebox/value": typeboxValueEntry,
		"@sinclair/typebox": typeboxEntry,
		"@sinclair/typebox/compile": typeboxCompileEntry,
		"@sinclair/typebox/value": typeboxValueEntry,
	};

	return _aliases;
}

async function loadExtensionModule(extensionPath: string) {
	const jiti = createJiti(import.meta.url, {
		moduleCache: false,
		alias: getAliases(),
	});

	const module = await jiti.import(extensionPath, { default: true });
	const factory = module as ExtensionFactory;
	return typeof factory !== "function" ? undefined : factory;
}

/**
 * Create an Extension object with empty collections.
 */
function createExtension(extensionPath: string, resolvedPath: string, metadata: PathMetadata): Extension {
	return {
		path: extensionPath,
		resolvedPath,
		sourceInfo: createSourceInfo(extensionPath, metadata),
		handlers: new Map(),
		tools: new Map(),
		messageRenderers: new Map(),
		commands: new Map(),
		flags: new Map(),
		shortcuts: new Map(),
		hudProviders: [],
	};
}

async function loadExtension(
	resource: ResolvedResource,
	cwd: string,
	eventBus: EventBus,
	runtime: ExtensionRuntime,
): Promise<{ extension: Extension | null; error: string | null }> {
	const resolvedPath = resolvePath(resource.path, cwd, { normalizeUnicodeSpaces: true });

	try {
		const factory = await loadExtensionModule(resolvedPath);
		if (!factory) {
			return { extension: null, error: `Extension does not export a valid factory function: ${resource.path}` };
		}

		const extension = createExtension(resource.path, resolvedPath, resource.metadata);
		const api = createExtensionAPI(extension, runtime, cwd, eventBus);
		await factory(api);

		return { extension, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { extension: null, error: `Failed to load extension ${resource.path}: ${message}` };
	}
}

/**
 * Create an Extension from an inline factory function.
 */
export async function loadExtensionFromFactory(
	factory: ExtensionFactory,
	cwd: string,
	eventBus: EventBus,
	runtime: ExtensionRuntime,
	extensionPath = "<inline>",
): Promise<Extension> {
	const extension = createExtension(extensionPath, extensionPath, {
		source: "inline",
		scope: "temporary",
		origin: "top-level",
	});
	const resolvedCwd = resolvePath(cwd);
	const api = createExtensionAPI(extension, runtime, resolvedCwd, eventBus);
	await factory(api);
	return extension;
}

/**
 * Load extensions from paths.
 */
export async function loadExtensions(
	resources: ResolvedResource[],
	cwd: string,
	eventBus?: EventBus,
	runtime?: ExtensionRuntime,
): Promise<LoadExtensionsResult> {
	const extensions: Extension[] = [];
	const errors: Array<{ path: string; error: string }> = [];
	const resolvedCwd = resolvePath(cwd);
	const resolvedEventBus = eventBus ?? createEventBus();
	const resolvedRuntime = runtime ?? createExtensionRuntime();

	for (const resource of resources) {
		const { extension, error } = await loadExtension(resource, resolvedCwd, resolvedEventBus, resolvedRuntime);

		if (error) {
			errors.push({ path: resource.path, error });
			continue;
		}

		if (extension) {
			extensions.push(extension);
		}
	}

	return {
		extensions,
		errors,
		runtime: resolvedRuntime,
	};
}

/**
 * Discover and load extensions from standard locations.
 */
export async function discoverAndLoadExtensions(
	configuredPaths: string[],
	cwd: string,
	agentDir: string = getAgentDir(),
	eventBus?: EventBus,
): Promise<LoadExtensionsResult> {
	const resolvedCwd = resolvePath(cwd);
	const resolvedAgentDir = resolvePath(agentDir);
	const resources: ResolvedResource[] = [];
	const seen = new Set<string>();

	const addPaths = (paths: string[], metadata: PathMetadata) => {
		for (const resourcePath of paths) {
			const resolved = path.resolve(resourcePath);
			if (seen.has(resolved)) continue;
			seen.add(resolved);
			resources.push({ path: resourcePath, enabled: true, metadata });
		}
	};

	const projectDir = path.join(resolvedCwd, CONFIG_DIR_NAME, "extensions");
	addPaths(collectAutoExtensionEntries(projectDir), {
		source: "auto",
		scope: "project",
		origin: "top-level",
		baseDir: projectDir,
	});

	const userDir = path.join(resolvedAgentDir, "extensions");
	addPaths(collectAutoExtensionEntries(userDir), {
		source: "auto",
		scope: "user",
		origin: "top-level",
		baseDir: userDir,
	});

	for (const configuredPath of configuredPaths) {
		const resolved = resolvePath(configuredPath, resolvedCwd, { normalizeUnicodeSpaces: true });
		const baseDir =
			fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
		const paths = baseDir === resolved ? collectAutoExtensionEntries(resolved) : [resolved];
		addPaths(paths, { source: "local", scope: "project", origin: "top-level", baseDir });
	}

	return loadExtensions(resources, resolvedCwd, eventBus);
}
