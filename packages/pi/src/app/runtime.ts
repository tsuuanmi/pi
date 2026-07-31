import { modelsAreEqual } from "@tsuuanmi/pi-ai";
import type { ExtensionFactory } from "#pi/runtime/extension-types";
import { AuthStorage } from "#pi/auth/auth-storage";
import type { Args } from "#pi/cli/args";
import { applyHttpProxySettings, configureHttpDispatcher } from "#pi/exec/http-dispatcher";
import type { ModelRegistry } from "#pi/model/model-registry";
import { resolveCliModel, resolveModelScope, type ScopedModel } from "#pi/model/model-resolver";
import type { CreateAgentSessionOptions } from "#pi/runtime/sdk";
import { type CreateAgentSessionRuntimeFactory, createAgentSessionRuntime, type AgentSessionRuntime } from "#pi/runtime/runtime";
import {
	type AgentSessionRuntimeDiagnostic,
	createAgentSessionFromServices,
	createAgentSessionServices,
} from "#pi/runtime/services";
import type { SessionManager } from "#pi/session/manager";
import { SettingsManager } from "#pi/settings/settings-manager";

export interface RuntimeOptions {
	parsed: Args;
	agentDir: string;
	sessionManager: SessionManager;
	extensionFactories?: ExtensionFactory[];
}

export function collectSettingsDiagnostics(
	settingsManager: SettingsManager,
	context: string,
): AgentSessionRuntimeDiagnostic[] {
	return settingsManager.drainErrors().map(({ scope, error }) => ({
		type: "warning",
		message: `(${context}, ${scope} settings) ${error.message}`,
	}));
}

function buildSessionOptions(
	parsed: Args,
	scopedModels: ScopedModel[],
	hasExistingSession: boolean,
	modelRegistry: ModelRegistry,
	settingsManager: SettingsManager,
): {
	options: CreateAgentSessionOptions;
	cliThinkingFromModel: boolean;
	diagnostics: AgentSessionRuntimeDiagnostic[];
} {
	const options: CreateAgentSessionOptions = {};
	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
	let cliThinkingFromModel = false;

	if (parsed.model) {
		const resolved = resolveCliModel({
			cliProvider: parsed.provider,
			cliModel: parsed.model,
			cliThinking: parsed.thinking,
			modelRegistry,
		});
		if (resolved.warning) diagnostics.push({ type: "warning", message: resolved.warning });
		if (resolved.error) diagnostics.push({ type: "error", message: resolved.error });
		if (resolved.model) {
			options.model = resolved.model;
			if (!parsed.thinking && resolved.thinkingLevel) {
				options.thinkingLevel = resolved.thinkingLevel;
				cliThinkingFromModel = true;
			}
		}
	}

	if (!options.model && scopedModels.length > 0 && !hasExistingSession) {
		const savedProvider = settingsManager.getDefaultProvider();
		const savedModelId = settingsManager.getDefaultModel();
		const savedModel = savedProvider && savedModelId ? modelRegistry.find(savedProvider, savedModelId) : undefined;
		const savedInScope = savedModel ? scopedModels.find((scoped) => modelsAreEqual(scoped.model, savedModel)) : undefined;

		const selected = savedInScope ?? scopedModels[0];
		options.model = selected.model;
		if (!parsed.thinking && selected.thinkingLevel) {
			options.thinkingLevel = selected.thinkingLevel;
		}
	}

	if (parsed.thinking) {
		options.thinkingLevel = parsed.thinking;
	}

	if (scopedModels.length > 0) {
		options.scopedModels = scopedModels.map((scoped) => ({
			model: scoped.model,
			thinkingLevel: scoped.thinkingLevel,
		}));
	}

	return { options, cliThinkingFromModel, diagnostics };
}

export async function createAppRuntime(options: RuntimeOptions): Promise<AgentSessionRuntime> {
	const { parsed, agentDir, sessionManager, extensionFactories } = options;
	const authStorage = AuthStorage.create();
	const createRuntime: CreateAgentSessionRuntimeFactory = async ({
		cwd,
		agentDir,
		sessionManager,
		sessionStartEvent,
	}) => {
		const runtimeSettingsManager = SettingsManager.create(cwd, agentDir);
		const services = await createAgentSessionServices({
			cwd,
			agentDir,
			authStorage,
			settingsManager: runtimeSettingsManager,
			extensionFlagValues: parsed.unknownFlags,
			resourceLoaderOptions: {
				extensionFactories,
			},
			resourceLoaderReloadOptions: {
				skipMissingInstalls: parsed.help || parsed.listModels !== undefined,
			},
		});
		const { settingsManager, modelRegistry, resourceLoader } = services;
		const diagnostics: AgentSessionRuntimeDiagnostic[] = [
			...services.diagnostics,
			...collectSettingsDiagnostics(settingsManager, "runtime creation"),
			...resourceLoader.getExtensions().errors.map(({ path, error }) => ({
				type: "error" as const,
				message: `Failed to load extension "${path}": ${error}`,
			})),
		];

		const modelPatterns = settingsManager.getEnabledModels();
		const scopedModels =
			modelPatterns && modelPatterns.length > 0 ? await resolveModelScope(modelPatterns, modelRegistry) : [];
		const {
			options: sessionOptions,
			cliThinkingFromModel,
			diagnostics: sessionOptionDiagnostics,
		} = buildSessionOptions(
			parsed,
			scopedModels,
			sessionManager.buildSessionContext().messages.length > 0,
			modelRegistry,
			settingsManager,
		);
		diagnostics.push(...sessionOptionDiagnostics);

		const created = await createAgentSessionFromServices({
			services,
			sessionManager,
			sessionStartEvent,
			model: sessionOptions.model,
			thinkingLevel: sessionOptions.thinkingLevel,
			scopedModels: sessionOptions.scopedModels,
			customTools: sessionOptions.customTools,
		});
		const cliThinkingOverride = parsed.thinking !== undefined || cliThinkingFromModel;
		if (created.session.model && cliThinkingOverride) {
			created.session.setThinkingLevel(created.session.thinkingLevel);
		}

		return {
			...created,
			services,
			diagnostics,
		};
	};

	const runtime = await createAgentSessionRuntime(createRuntime, {
		cwd: sessionManager.getCwd(),
		agentDir,
		sessionManager,
	});
	const { settingsManager } = runtime.services;
	applyHttpProxySettings(settingsManager.getGlobalSettings().httpProxy);
	configureHttpDispatcher(settingsManager.getHttpIdleTimeoutMs());
	return runtime;
}
