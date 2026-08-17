import {
  GEMINI_WEB_CAPABILITY_LABELS,
  GEMINI_WEB_MODEL_IDS,
  type GeminiWebCapabilityMarker,
  type GeminiWebModelId,
} from "#runtime/browser/gemini-web/capabilities";

export const GEMINI_WEB_HOME_URL = "https://gemini.google.com/app";
export const GEMINI_WEB_MODEL_PREFIX = "gemini-web/";

interface GeminiWebModelRoute {
  id: string;
  capability: GeminiWebModelId;
  label: string;
  displayName: string;
  inputModalities: readonly ["text"];
}

const GEMINI_WEB_MODEL_ROUTES: readonly GeminiWebModelRoute[] = GEMINI_WEB_MODEL_IDS.map(capability => ({
  id: `${GEMINI_WEB_MODEL_PREFIX}${capability}`,
  capability,
  label: GEMINI_WEB_CAPABILITY_LABELS[capability],
  displayName: `Gemini Web - ${capability[0]!.toUpperCase()}${capability.slice(1)}`,
  inputModalities: ["text"],
}));

const routesById = new Map(GEMINI_WEB_MODEL_ROUTES.map(route => [route.id, route]));

export function resolveGeminiWebModelRoute(
  modelId: string,
  marker?: GeminiWebCapabilityMarker,
): GeminiWebModelRoute {
  const route = routesById.get(modelId);
  if (!route) throw new Error(`Gemini Web model is not supported: ${modelId}`);
  const label = marker?.labels[route.capability] ?? route.label;
  if (marker && !marker.available.includes(route.capability)) {
    throw new Error(`Gemini Web capability is not available: ${label}`);
  }
  return { ...route, label };
}
