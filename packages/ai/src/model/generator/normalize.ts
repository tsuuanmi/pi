import type { ModelInput, ThinkingLevelMap } from "./schemas.ts";

const reasoningLevels = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

export function inputFromModalities(modalities: string[] | undefined): ModelInput {
	const input: ModelInput = ["text"];
	if (modalities?.includes("image")) input.push("image");
	return input;
}

export function thinkingMap(modelId: string, values: string[] | undefined): ThinkingLevelMap | undefined {
	if (!values?.length) return undefined;

	const map: Record<string, string | null> = {};
	for (const value of values) {
		const level = value === "none" ? "off" : value;
		if (!reasoningLevels.has(level)) {
			throw new Error(`Unknown reasoning level "${value}" for ${modelId}`);
		}
		map[level] = value;
	}

	return Object.keys(map).length > 0 ? (map as ThinkingLevelMap) : undefined;
}
