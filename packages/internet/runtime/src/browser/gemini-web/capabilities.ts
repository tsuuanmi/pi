export const GEMINI_WEB_MODEL_IDS = ["flash", "thinking", "pro"] as const;
export type GeminiWebModelId = (typeof GEMINI_WEB_MODEL_IDS)[number];

export const GEMINI_WEB_CAPABILITY_LABELS: Readonly<Record<GeminiWebModelId, string>> = {
  flash: "Flash",
  thinking: "Thinking",
  pro: "Pro",
};

export interface GeminiWebCapabilityMarker {
  version: 1;
  provider: "gemini-web";
  verifiedAt: string;
  labels: Record<GeminiWebModelId, string>;
  available: GeminiWebModelId[];
}

export interface GeminiWebMenuItem {
  label: string;
  selected: boolean;
  active: boolean;
}

export interface GeminiWebDiscoveredCapability {
  id: GeminiWebModelId;
  label: string;
  available: boolean;
  selected: boolean;
}

function normalizedLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function labelMatches(item: string, expected: string): boolean {
  const normalizedItem = normalizedLabel(item);
  const normalizedExpected = normalizedLabel(expected);
  return normalizedItem === normalizedExpected || new RegExp(`\\b${normalizedExpected}\\b`, "i").test(normalizedItem);
}

export function modelIdForGeminiLabel(label: string): GeminiWebModelId | undefined {
  const normalized = normalizedLabel(label);
  if (/\bthinking\b/i.test(normalized)) return "thinking";
  if (/\bflash(?:[\s-]+lite)\b/i.test(normalized)) return undefined;
  if (/\bflash\b/i.test(normalized)) return "flash";
  if (/\bpro\b/i.test(normalized)) return "pro";
  return undefined;
}

export function normalizeGeminiModelLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, " ");
  return normalized.match(/\b\d+(?:\.\d+)*\s+(?:Flash|Thinking|Pro)\b/i)?.[0] ?? normalized;
}

export function createGeminiCapabilityMarker(
  capabilities: readonly GeminiWebDiscoveredCapability[],
  verifiedAt = new Date().toISOString(),
): GeminiWebCapabilityMarker {
  const available = capabilities.filter(capability => capability.available).map(capability => capability.id);
  const labels = Object.fromEntries(GEMINI_WEB_MODEL_IDS.map(id => [
    id,
    capabilities.find(capability => capability.id === id)?.label ?? GEMINI_WEB_CAPABILITY_LABELS[id],
  ])) as Record<GeminiWebModelId, string>;
  return { version: 1, provider: "gemini-web", verifiedAt, labels, available };
}

export function validateGeminiCapabilityMarker(value: unknown): GeminiWebCapabilityMarker {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gemini capability marker must be an object");
  }
  const marker = value as Record<string, unknown>;
  if (marker.version !== 1 || marker.provider !== "gemini-web") {
    throw new Error("Gemini capability marker has an unsupported version or provider");
  }
  if (typeof marker.verifiedAt !== "string" || !marker.verifiedAt.trim()) {
    throw new Error("Gemini capability marker is missing verifiedAt");
  }
  if (!marker.labels || typeof marker.labels !== "object" || Array.isArray(marker.labels)) {
    throw new Error("Gemini capability marker is missing labels");
  }
  const labels = marker.labels as Record<string, unknown>;
  const normalizedLabels = {} as Record<GeminiWebModelId, string>;
  for (const id of GEMINI_WEB_MODEL_IDS) {
    if (typeof labels[id] !== "string" || !labels[id].trim()) {
      throw new Error(`Gemini capability marker is missing the ${id} label`);
    }
    normalizedLabels[id] = labels[id].trim();
  }
  if (!Array.isArray(marker.available)
    || marker.available.some(id => !GEMINI_WEB_MODEL_IDS.includes(id as GeminiWebModelId))) {
    throw new Error("Gemini capability marker has invalid availability");
  }
  return {
    version: 1,
    provider: "gemini-web",
    verifiedAt: marker.verifiedAt,
    labels: normalizedLabels,
    available: [...new Set(marker.available)] as GeminiWebModelId[],
  };
}

export function discoverGeminiCapabilities(
  items: readonly GeminiWebMenuItem[],
  marker?: GeminiWebCapabilityMarker,
): readonly GeminiWebDiscoveredCapability[] {
  const labels = marker?.labels ?? GEMINI_WEB_CAPABILITY_LABELS;
  return GEMINI_WEB_MODEL_IDS.map(id => {
    const matching = items.find(item => modelIdForGeminiLabel(item.label) === id && labelMatches(item.label, labels[id]));
    return {
      id,
      label: matching ? normalizeGeminiModelLabel(matching.label) : labels[id],
      available: matching !== undefined,
      selected: matching?.selected === true && matching.active,
    };
  });
}
