import type { KeyId } from "@tsuuanmi/pi-tui";
import type { ExtensionContext } from "#pi/api/context-types";
import type {
	Extension,
	ExtensionAPI,
	ExtensionRuntime,
	MessageRenderer,
	RegisteredCommand,
} from "#pi/api/extension-types";
import type { ProviderConfig } from "#pi/api/provider-types";
import type { ProgramOptions } from "#pi/execution/program";
import { runProgram } from "#pi/execution/program";
import type { EventBus } from "#pi/hooks/event-bus";
import { type HookHandlerFn, registerExtensionHook } from "#pi/hooks/register";
import type { ExtensionToolSpec } from "#pi/tool/spec";

const STALE_CONTEXT_MESSAGE =
	"This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.switchSession(), or ctx.reload(). For newSession and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";

/** Create runtime actions shared by extension APIs. */
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
		refreshTools: () => {},
		getCommands: notInitialized,
		setModel: () => Promise.reject(new Error("Extension runtime not initialized")),
		getThinkingLevel: notInitialized,
		setThinkingLevel: notInitialized,
		flagValues: new Map(),
		pendingProviderRegistrations: [],
		assertActive,
		invalidate: (message) => {
			state.staleMessage ??= message ?? STALE_CONTEXT_MESSAGE;
		},
		registerProvider: (name, config, extensionPath = "<unknown>") => {
			runtime.pendingProviderRegistrations.push({ name, config, extensionPath });
		},
		unregisterProvider: (name) => {
			runtime.pendingProviderRegistrations = runtime.pendingProviderRegistrations.filter(
				(entry) => entry.name !== name,
			);
		},
	};

	return runtime;
}

/** Create the extension-facing API for a loaded extension. */
export function createExtensionAPI(
	extension: Extension,
	runtime: ExtensionRuntime,
	cwd: string,
	eventBus: EventBus,
): ExtensionAPI {
	const api = {
		on(event: string, handler: HookHandlerFn): void {
			registerExtensionHook(extension, runtime, event, handler);
		},
		registerTool(tool: ExtensionToolSpec): void {
			runtime.assertActive();
			if (extension.tools.has(tool.name)) {
				throw new Error(`Tool "${tool.name}" is already registered by this extension.`);
			}
			extension.tools.set(tool.name, { definition: tool, sourceInfo: extension.sourceInfo });
			runtime.refreshTools();
		},
		unregisterTool(name: string): void {
			runtime.assertActive();
			if (extension.tools.delete(name)) runtime.refreshTools();
		},
		refreshTools(options?: { includeAllExtensionTools?: boolean }): void {
			runtime.assertActive();
			runtime.refreshTools(options);
		},
		registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void {
			runtime.assertActive();
			extension.commands.set(name, { name, sourceInfo: extension.sourceInfo, ...options });
		},
		registerShortcut(
			shortcut: KeyId,
			options: { description?: string; handler: (ctx: ExtensionContext) => Promise<void> | void },
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
		getFlag(name: string): boolean | string | undefined {
			runtime.assertActive();
			return extension.flags.has(name) ? runtime.flagValues.get(name) : undefined;
		},
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
