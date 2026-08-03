import {
	clampThinkingLevel,
	getSupportedThinkingLevels,
	type Model,
	modelsAreEqual,
	THINKING_LEVELS,
	type ThinkingLevel,
} from "@tsuuanmi/pi-ai";
import { DEFAULT_THINKING_LEVEL } from "#pi/cli/thinking-level";
import type { ModelCycleResult } from "#pi/runtime/agent-session";
import type { AgentSessionContext } from "#pi/runtime/agent-session-context";

export async function setModel(model: Model<any>, ctx: AgentSessionContext): Promise<void> {
	if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
		throw new Error(`No API key for ${model.provider}/${model.id}`);
	}

	const previousModel = ctx.model;
	const thinkingLevel = getThinkingLevelForModelSwitch(undefined, ctx);
	ctx.state.model = model;
	ctx.sessionManager.appendModelChange(model.provider, model.id);
	ctx.settingsManager.setDefaultModelAndProvider(model.provider, model.id);

	// Re-clamp thinking level for new model's capabilities
	setThinkingLevel(thinkingLevel, ctx);

	await emitModelSelect(model, previousModel, "set", ctx);
}

export async function cycleModel(
	direction: "forward" | "backward" = "forward",
	ctx: AgentSessionContext,
): Promise<ModelCycleResult | undefined> {
	if (ctx.scopedModels.length > 0) {
		return cycleScopedModel(direction, ctx);
	}
	return cycleAvailableModel(direction, ctx);
}

async function cycleScopedModel(
	direction: "forward" | "backward",
	ctx: AgentSessionContext,
): Promise<ModelCycleResult | undefined> {
	const scopedModels = ctx.scopedModels.filter((scoped) => ctx.modelRegistry.hasConfiguredAuth(scoped.model));
	if (scopedModels.length <= 1) return undefined;

	const currentModel = ctx.model;
	let currentIndex = scopedModels.findIndex((sm) => modelsAreEqual(sm.model, currentModel));

	if (currentIndex === -1) currentIndex = 0;
	const len = scopedModels.length;
	const nextIndex = direction === "forward" ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
	const next = scopedModels[nextIndex];
	const thinkingLevel = getThinkingLevelForModelSwitch(next.thinkingLevel, ctx);

	// Apply model
	ctx.state.model = next.model;
	ctx.sessionManager.appendModelChange(next.model.provider, next.model.id);
	ctx.settingsManager.setDefaultModelAndProvider(next.model.provider, next.model.id);

	// Apply thinking level.
	// - Explicit scoped model thinking level overrides current session level
	// - Undefined scoped model thinking level inherits the current session preference
	// setThinkingLevel clamps to model capabilities.
	setThinkingLevel(thinkingLevel, ctx);

	await emitModelSelect(next.model, currentModel, "cycle", ctx);

	return { model: next.model, thinkingLevel: ctx.state.thinkingLevel, isScoped: true };
}

async function cycleAvailableModel(
	direction: "forward" | "backward",
	ctx: AgentSessionContext,
): Promise<ModelCycleResult | undefined> {
	const availableModels = await ctx.modelRegistry.getAvailable();
	if (availableModels.length <= 1) return undefined;

	const currentModel = ctx.model;
	let currentIndex = availableModels.findIndex((m) => modelsAreEqual(m, currentModel));

	if (currentIndex === -1) currentIndex = 0;
	const len = availableModels.length;
	const nextIndex = direction === "forward" ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
	const nextModel = availableModels[nextIndex];

	const thinkingLevel = getThinkingLevelForModelSwitch(undefined, ctx);
	ctx.state.model = nextModel;
	ctx.sessionManager.appendModelChange(nextModel.provider, nextModel.id);
	ctx.settingsManager.setDefaultModelAndProvider(nextModel.provider, nextModel.id);

	// Re-clamp thinking level for new model's capabilities
	setThinkingLevel(thinkingLevel, ctx);

	await emitModelSelect(nextModel, currentModel, "cycle", ctx);

	return { model: nextModel, thinkingLevel: ctx.state.thinkingLevel, isScoped: false };
}

// =========================================================================
// Thinking Level Management
// =========================================================================

export function setThinkingLevel(level: ThinkingLevel, ctx: AgentSessionContext): void {
	const availableLevels = getAvailableThinkingLevels(ctx);
	const effectiveLevel = availableLevels.includes(level) ? level : clampLevel(level, availableLevels, ctx);

	// Only persist if actually changing
	const previousLevel = ctx.state.thinkingLevel;
	const isChanging = effectiveLevel !== previousLevel;

	ctx.state.thinkingLevel = effectiveLevel;

	if (isChanging) {
		ctx.sessionManager.appendThinkingLevelChange(effectiveLevel);
		if (supportsThinking(ctx) || effectiveLevel !== "off") {
			ctx.settingsManager.setDefaultThinkingLevel(effectiveLevel);
		}
		ctx.emit({ type: "thinking_level_changed", level: effectiveLevel });
		void ctx.extensionRunner.emit({
			type: "thinking_level_select",
			level: effectiveLevel,
			previousLevel,
		});
	}
}

export function cycleThinkingLevel(ctx: AgentSessionContext): ThinkingLevel | undefined {
	if (!supportsThinking(ctx)) return undefined;

	const levels = getAvailableThinkingLevels(ctx);
	const currentIndex = levels.indexOf(ctx.state.thinkingLevel);
	const nextIndex = (currentIndex + 1) % levels.length;
	const nextLevel = levels[nextIndex];

	setThinkingLevel(nextLevel, ctx);
	return nextLevel;
}

export function getAvailableThinkingLevels(ctx: AgentSessionContext): ThinkingLevel[] {
	if (!ctx.model) return [...THINKING_LEVELS];
	return getSupportedThinkingLevels(ctx.model) as ThinkingLevel[];
}

export function supportsThinking(ctx: AgentSessionContext): boolean {
	return !!ctx.model?.reasoning;
}

function getThinkingLevelForModelSwitch(
	explicitLevel: ThinkingLevel | undefined,
	ctx: AgentSessionContext,
): ThinkingLevel {
	if (explicitLevel !== undefined) {
		return explicitLevel;
	}
	if (!supportsThinking(ctx)) {
		return ctx.settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
	}
	return ctx.state.thinkingLevel;
}

function clampLevel(level: ThinkingLevel, _availableLevels: ThinkingLevel[], ctx: AgentSessionContext): ThinkingLevel {
	return ctx.model ? (clampThinkingLevel(ctx.model, level) as ThinkingLevel) : "off";
}

async function emitModelSelect(
	nextModel: Model<any>,
	previousModel: Model<any> | undefined,
	source: "set" | "cycle" | "restore",
	ctx: AgentSessionContext,
): Promise<void> {
	if (modelsAreEqual(previousModel, nextModel)) return;
	await ctx.extensionRunner.emit({
		type: "model_select",
		model: nextModel,
		previousModel,
		source,
	});
}
