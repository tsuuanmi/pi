/**
 * Extension loader - loads TypeScript extension modules using jiti.
 *
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePath } from "@tsuuanmi/pi-agent/node";
import { registerWorkflows } from "@tsuuanmi/pi-workflows/register";
import { createJiti } from "jiti/static";
import type {
	Extension,
	ExtensionAPI,
	ExtensionFactory,
	ExtensionRuntime,
	LoadExtensionsResult,
} from "#pi/api/extension-types";
import { createEventBus, type EventBus } from "#pi/hooks/event-bus";
import { CONFIG_DIR_NAME } from "#pi/loader/app";
import { getAgentDir } from "#pi/loader/paths";
import { collectAutoExtensionEntries } from "#pi/resources/discovery";
import { createSourceInfo } from "#pi/resources/source-info";
import type { PathMetadata, ResolvedResource } from "#pi/resources/types";
import { createExtensionAPI, createExtensionRuntime } from "#pi/runtime/extensions/api";
import { registerSubagentControls } from "#pi/subagents/tools";

const require = createRequire(import.meta.url);

function builtinWorkflowsExtension(pi: ExtensionAPI): void {
	registerWorkflows(pi);
	registerSubagentControls(pi);
}

export function getBuiltinExtensionFactories(): ExtensionFactory[] {
	return [builtinWorkflowsExtension];
}

/** Get aliases for jiti extension imports. */
let _aliases: Record<string, string> | null = null;

function getAliases(): Record<string, string> {
	if (_aliases) return _aliases;

	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const packageIndex = path.resolve(__dirname, "..", "..", "index.js");

	const typeboxEntry = require.resolve("typebox");
	const typeboxCompileEntry = require.resolve("typebox/compile");
	const typeboxValueEntry = require.resolve("typebox/value");

	const packagesRoot = path.resolve(__dirname, "../../../../");
	// Resolve bare @tsuuanmi/* specifiers via ESM (import.meta.resolve) so the
	// "import" condition in their package "exports" is honored. CJS
	// require.resolve only sees "require"/"default" conditions, which these
	// packages do not define, raising "No \"exports\" main defined".
	const resolveWorkspaceOrImport = (workspaceRelativePath: string, specifier: string): string => {
		const workspacePath = path.join(packagesRoot, workspaceRelativePath);
		if (fs.existsSync(workspacePath)) {
			return workspacePath;
		}
		return fileURLToPath(import.meta.resolve(specifier));
	};

	const piEntry = packageIndex;
	const piExtensionsEntry = path.resolve(__dirname, "index.js");
	const piConfigEntry = path.resolve(__dirname, "..", "config.js");
	const piAgentEntry = resolveWorkspaceOrImport("agent/dist/index.js", "@tsuuanmi/pi-agent");
	const piAgentNodeEntry = resolveWorkspaceOrImport("agent/dist/node/node.js", "@tsuuanmi/pi-agent/node");
	const piTuiEntry = resolveWorkspaceOrImport("tui/dist/index.js", "@tsuuanmi/pi-tui");
	const piAiEntry = resolveWorkspaceOrImport("ai/dist/index.js", "@tsuuanmi/pi-ai");
	const piAiOauthEntry = resolveWorkspaceOrImport("ai/dist/auth/oauth/index.js", "@tsuuanmi/pi-ai/oauth");
	const piWorkflowsEntry = resolveWorkspaceOrImport("workflows/dist/index.js", "@tsuuanmi/pi-workflows");
	const piWorkflowsInternal = fs.existsSync(path.join(packagesRoot, "workflows/src"))
		? path.join(packagesRoot, "workflows/src/*")
		: path.join(packagesRoot, "workflows/dist/*");

	_aliases = {
		"@tsuuanmi/pi/extensions": piExtensionsEntry,
		"@tsuuanmi/pi/loader/config": piConfigEntry,
		"@tsuuanmi/pi": piEntry,
		"@tsuuanmi/pi-agent/node": piAgentNodeEntry,
		"@tsuuanmi/pi-agent": piAgentEntry,
		"@tsuuanmi/pi-tui": piTuiEntry,
		"@tsuuanmi/pi-ai": piAiEntry,
		"@tsuuanmi/pi-ai/oauth": piAiOauthEntry,
		"@tsuuanmi/pi-workflows": piWorkflowsEntry,
		"#workflows/*": piWorkflowsInternal,
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
