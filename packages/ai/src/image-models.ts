import { IMAGE_MODELS } from "./image-models.generated.ts";
import type { ImagesApi, ImagesModel, KnownImagesProvider } from "./types.ts";

const imageModelRegistry: Map<string, Map<string, ImagesModel<ImagesApi>>> = new Map();

for (const [provider, models] of Object.entries(
	IMAGE_MODELS as Record<string, Record<string, ImagesModel<ImagesApi>>>,
)) {
	imageModelRegistry.set(provider, new Map(Object.entries(models)));
}

export function getImageModel(provider: string, modelId: string): ImagesModel<ImagesApi> | undefined {
	return imageModelRegistry.get(provider)?.get(modelId);
}

export function getImageProviders(): KnownImagesProvider[] {
	return Array.from(imageModelRegistry.keys()) as KnownImagesProvider[];
}

export function getImageModels(provider: string): ImagesModel<ImagesApi>[] {
	return Array.from(imageModelRegistry.get(provider)?.values() ?? []);
}
