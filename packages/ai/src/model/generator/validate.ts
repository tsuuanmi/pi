import type { Model } from "#ai/model/index";
import type { Api } from "#ai/protocol/ids";

export function groupModels(models: Model<Api>[]): Record<string, Record<string, Model<Api>>> {
	const grouped: Record<string, Record<string, Model<Api>>> = {};
	const seen = new Set<string>();

	for (const model of models) {
		const key = `${model.provider}:${model.id}`;
		if (seen.has(key)) throw new Error(`Duplicate model: ${key}`);
		seen.add(key);

		grouped[model.provider] ??= {};
		grouped[model.provider][model.id] = model;
	}

	for (const [provider, providerModels] of Object.entries(grouped)) {
		for (const model of Object.values(providerModels)) {
			if (model.provider !== provider) {
				throw new Error(
					`Provider mismatch: ${model.id} grouped under ${provider}, model.provider is ${model.provider}`,
				);
			}
		}
	}

	return grouped;
}
