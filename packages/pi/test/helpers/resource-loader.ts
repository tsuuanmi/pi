import type { Extension, ExtensionFactory, LoadExtensionsResult } from "@tsuuanmi/pi/extensions";
import { createEventBus } from "@tsuuanmi/pi/extensions";
import { loadExtensionFromFactory } from "#pi/loader/extensions/loader";
import type { ResourceLoader } from "#pi/loader/resources";
import { createExtensionRuntime } from "#pi/runtime/extensions/api";

export interface CreateTestExtensionsResultInput {
	factory: ExtensionFactory;
	path?: string;
}

export async function createTestExtensionsResult(
	inputs: Array<ExtensionFactory | CreateTestExtensionsResultInput>,
	cwd = process.cwd(),
): Promise<LoadExtensionsResult> {
	const runtime = createExtensionRuntime();
	const eventBus = createEventBus();
	const extensions: Extension[] = [];

	for (const [index, input] of inputs.entries()) {
		const factory = typeof input === "function" ? input : input.factory;
		const extensionPath =
			typeof input === "function" ? `<inline:${index + 1}>` : (input.path ?? `<inline:${index + 1}>`);
		extensions.push(await loadExtensionFromFactory(factory, cwd, eventBus, runtime, extensionPath));
	}

	return { extensions, errors: [], runtime };
}

export interface CreateTestResourceLoaderOptions {
	extensionsResult?: LoadExtensionsResult;
	agentProfiles?: ReturnType<ResourceLoader["getAgentProfiles"]>;
}

export function createTestResourceLoader(options: CreateTestResourceLoaderOptions = {}): ResourceLoader {
	const extensionsResult = options.extensionsResult ?? {
		extensions: [],
		errors: [],
		runtime: createExtensionRuntime(),
	};

	return {
		getExtensions: () => extensionsResult,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getAgentProfiles: () => options.agentProfiles ?? { profiles: [], diagnostics: [] },
		getSystemPrompt: () => undefined,
		getAppendSystemPrompt: () => [],
		extendResources: () => {},
		reload: async () => {},
	};
}
