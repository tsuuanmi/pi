/**
 * Extension loader - loads TypeScript extension modules using jiti.
 *
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePath } from "@tsuuanmi/pi-agent/node";
import type { KeyId } from "@tsuuanmi/pi-tui";
import { createJiti } from "jiti/static";
import type { ProgramOptions } from "#pi/execution/program";
import { runProgram } from "#pi/execution/program";
import { createEventBus, type EventBus } from "#pi/extensions/event-bus";
import { type HookHandlerFn, registerExtensionHook } from "#pi/extensions/hooks/registration";
import type {
	Extension,
	ExtensionAPI,
	ExtensionFactory,
	ExtensionRuntime,
	LoadExtensionsResult,
	MessageRenderer,
	ProviderConfig,
	RegisteredCommand,
	ToolDefinition,
} from "#pi/extensions/types";
import { CONFIG_DIR_NAME } from "#pi/loader/app";
import { getAgentDir } from "#pi/loader/paths";
import { collectAutoExtensionEntries } from "#pi/resources/discovery";
import { createSourceInfo } from "#pi/resources/source-info";
import type { PathMetadata, ResolvedResource } from "#pi/resources/types";

const require = createRequire(import.meta.url);

/** Get aliases for jiti extension imports. */
let _aliases: Record<string, string> | null = null;

function getAliases(): Record<string, string> {
	if (_aliases) return _aliases;

	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const packageIndex = path.resolve(__dirname, "..", "index.js");

	const typeboxEntry = require.resolve("typebox");
	const typeboxCompileEntry = require.resolve("typebox/compile");
	const typeboxValueEntry = require.resolve("typebox/value");

	const packagesRoot = path.resolve(__dirname, "../../../");
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
	const piConfigEntry = path.resolve(__dirname, "config.js");
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

/**
 * Create a runtime with throwing stubs for action methods.
 * Runner.bindCore() replaces these with real implementations.
 */
export function createExtensionRuntime(): ExtensionRuntime {
	const notInitialized = () => {
		throw new Error("Extension runtime not initialized. Action methods cannot be called during extension loading.");
	};
	const state: { staleMessage?: string } = {};
	const assertActive = () => {
		if (state.staleMessage) {
			throw new Error(state.staleMessage);
		}
	};

	const runtime: ExtensionRuntime = {
		sendMessage: notInitialized,
		sendUserMessage: notInitialized,
		appendEntry: notInitialized,
		setSessionName: notInitialized,
		getSessionName: notInitialized,
		setLabel: notInitialized,
		getActiveTools: notInitialized,
		getAllTools: notInitialized,
		setActiveTools: notInitialized,
		// registerTool() is valid during extension load; refresh is only needed post-bind.
		refreshTools: () => {},
		getCommands: notInitialized,
		setModel: () => Promise.reject(new Error("Extension runtime not initialized")),
		getThinkingLevel: notInitialized,
		setThinkingLevel: notInitialized,
		flagValues: new Map(),
		pendingProviderRegistrations: [],
		assertActive,
		invalidate: (message) => {
			state.staleMessage ??=
				message ??
				"This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.switchSession(), or ctx.reload(). For newSession and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";
		},
		// Pre-bind: queue registrations so bindCore() can flush them once the
		// model registry is available. bindCore() replaces both with direct calls.
		registerProvider: (name, config, extensionPath = "<unknown>") => {
			runtime.pendingProviderRegistrations.push({ name, config, extensionPath });
		},
		unregisterProvider: (name) => {
			runtime.pendingProviderRegistrations = runtime.pendingProviderRegistrations.filter((r) => r.name !== name);
		},
	};

	return runtime;
}

/**
 * Create the ExtensionAPI for an extension.
 * Registration methods write to the extension object.
 * Action methods delegate to the shared runtime.
 */
function createExtensionAPI(
	extension: Extension,
	runtime: ExtensionRuntime,
	cwd: string,
	eventBus: EventBus,
): ExtensionAPI {
	const api = {
		// Registration methods - write to extension
		on(event: string, handler: HookHandlerFn): void {
			registerExtensionHook(extension, runtime, event, handler);
		},

		registerTool(tool: ToolDefinition): void {
			runtime.assertActive();
			extension.tools.set(tool.name, {
				definition: tool,
				sourceInfo: extension.sourceInfo,
			});
			runtime.refreshTools();
		},

		unregisterTool(name: string): void {
			runtime.assertActive();
			if (extension.tools.delete(name)) {
				runtime.refreshTools();
			}
		},

		refreshTools(options?: { includeAllExtensionTools?: boolean }): void {
			runtime.assertActive();
			runtime.refreshTools(options);
		},

		registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void {
			runtime.assertActive();
			extension.commands.set(name, {
				name,
				sourceInfo: extension.sourceInfo,
				...options,
			});
		},

		registerShortcut(
			shortcut: KeyId,
			options: {
				description?: string;
				handler: (ctx: import("#pi/extensions/types").ExtensionContext) => Promise<void> | void;
			},
		): void {
			runtime.assertActive();
			extension.shortcuts.set(shortcut, { shortcut, extensionPath: extension.path, ...options });
		},

		registerFlag(
			name: string,
			options: { description?: string; type: "boolean" | "string"; default?: boolean | string },
		): void {
			runtime.assertActive();
			extension.flags.set(name, { name, extensionPath: extension.path, ...options });
			if (options.default !== undefined && !runtime.flagValues.has(name)) {
				runtime.flagValues.set(name, options.default);
			}
		},

		registerMessageRenderer<T>(customType: string, renderer: MessageRenderer<T>): void {
			runtime.assertActive();
			extension.messageRenderers.set(customType, renderer as MessageRenderer);
		},

		// Flag access - checks extension registered it, reads from runtime
		getFlag(name: string): boolean | string | undefined {
			runtime.assertActive();
			if (!extension.flags.has(name)) return undefined;
			return runtime.flagValues.get(name);
		},

		// Action methods - delegate to shared runtime
		sendMessage(message, options): void {
			runtime.assertActive();
			runtime.sendMessage(message, options);
		},

		sendUserMessage(content, options): void {
			runtime.assertActive();
			runtime.sendUserMessage(content, options);
		},

		appendEntry(customType: string, data?: unknown): void {
			runtime.assertActive();
			runtime.appendEntry(customType, data);
		},

		setSessionName(name: string): void {
			runtime.assertActive();
			runtime.setSessionName(name);
		},

		getSessionName(): string | undefined {
			runtime.assertActive();
			return runtime.getSessionName();
		},

		setLabel(entryId: string, label: string | undefined): void {
			runtime.assertActive();
			runtime.setLabel(entryId, label);
		},

		exec(command: string, args: string[], options?: ProgramOptions) {
			runtime.assertActive();
			return runProgram(command, args, { ...options, cwd: options?.cwd ?? cwd });
		},

		getActiveTools(): string[] {
			runtime.assertActive();
			return runtime.getActiveTools();
		},

		getAllTools() {
			runtime.assertActive();
			return runtime.getAllTools();
		},

		setActiveTools(toolNames: string[]): void {
			runtime.assertActive();
			runtime.setActiveTools(toolNames);
		},

		getCommands() {
			runtime.assertActive();
			return runtime.getCommands();
		},

		setModel(model) {
			runtime.assertActive();
			return runtime.setModel(model);
		},

		getThinkingLevel() {
			runtime.assertActive();
			return runtime.getThinkingLevel();
		},

		setThinkingLevel(level) {
			runtime.assertActive();
			runtime.setThinkingLevel(level);
		},

		registerProvider(name: string, config: ProviderConfig) {
			runtime.assertActive();
			runtime.registerProvider(name, config, extension.path);
		},

		unregisterProvider(name: string) {
			runtime.assertActive();
			runtime.unregisterProvider(name, extension.path);
		},

		events: eventBus,
	} as ExtensionAPI;

	return api;
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
