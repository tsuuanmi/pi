import type { Model } from "#ai/model/index";
import type { Api } from "#ai/protocol/ids";
import { THINKING_LEVELS, type ThinkingLevel } from "#ai/protocol/options";

export interface ScopedModel {
	model: Model<Api>;
	thinkingLevel?: ThinkingLevel;
}

export interface ParsedModelResult {
	model: Model<Api> | undefined;
	thinkingLevel?: ThinkingLevel;
	warning: string | undefined;
}

export interface ParseModelOptions {
	allowInvalidThinkingLevelFallback?: boolean;
	levels?: readonly ThinkingLevel[];
}

function isAlias(id: string): boolean {
	if (id.endsWith("-latest")) return true;
	return !/-\d{8}$/.test(id);
}

function findExactModel(reference: string, models: readonly Model<Api>[]): Model<Api> | undefined {
	const trimmed = reference.trim();
	if (!trimmed) return undefined;

	const normalized = trimmed.toLowerCase();
	const canonicalMatches = models.filter((model) => `${model.provider}/${model.id}`.toLowerCase() === normalized);
	if (canonicalMatches.length === 1) return canonicalMatches[0];
	if (canonicalMatches.length > 1) return undefined;

	const slashIndex = trimmed.indexOf("/");
	if (slashIndex !== -1) {
		const provider = trimmed.slice(0, slashIndex).trim();
		const modelId = trimmed.slice(slashIndex + 1).trim();
		if (provider && modelId) {
			const providerMatches = models.filter(
				(model) =>
					model.provider.toLowerCase() === provider.toLowerCase() &&
					model.id.toLowerCase() === modelId.toLowerCase(),
			);
			if (providerMatches.length === 1) return providerMatches[0];
			if (providerMatches.length > 1) return undefined;
		}
	}

	const idMatches = models.filter((model) => model.id.toLowerCase() === normalized);
	return idMatches.length === 1 ? idMatches[0] : undefined;
}

function matchModel(pattern: string, models: readonly Model<Api>[]): Model<Api> | undefined {
	const exact = findExactModel(pattern, models);
	if (exact) return exact;

	const matches = models.filter(
		(model) =>
			model.id.toLowerCase().includes(pattern.toLowerCase()) ||
			model.name?.toLowerCase().includes(pattern.toLowerCase()),
	);
	if (matches.length === 0) return undefined;

	const aliases = matches.filter((model) => isAlias(model.id));
	if (aliases.length > 0) {
		aliases.sort((a, b) => b.id.localeCompare(a.id));
		return aliases[0];
	}

	matches.sort((a, b) => b.id.localeCompare(a.id));
	return matches[0];
}

export function parseModelPattern(
	pattern: string,
	models: readonly Model<Api>[],
	options?: ParseModelOptions,
): ParsedModelResult {
	const model = matchModel(pattern, models);
	if (model) return { model, thinkingLevel: undefined, warning: undefined };

	const colonIndex = pattern.lastIndexOf(":");
	if (colonIndex === -1) return { model: undefined, thinkingLevel: undefined, warning: undefined };

	const prefix = pattern.slice(0, colonIndex);
	const suffix = pattern.slice(colonIndex + 1);
	const levels = options?.levels ?? THINKING_LEVELS;

	if (levels.includes(suffix as ThinkingLevel)) {
		const result = parseModelPattern(prefix, models, options);
		if (result.model) {
			return {
				model: result.model,
				thinkingLevel: result.warning ? undefined : (suffix as ThinkingLevel),
				warning: result.warning,
			};
		}
		return result;
	}

	if (options?.allowInvalidThinkingLevelFallback === false) {
		return { model: undefined, thinkingLevel: undefined, warning: undefined };
	}

	const result = parseModelPattern(prefix, models, options);
	if (!result.model) return result;
	return {
		model: result.model,
		thinkingLevel: undefined,
		warning: `Invalid thinking level "${suffix}" in pattern "${pattern}". Using default instead.`,
	};
}
