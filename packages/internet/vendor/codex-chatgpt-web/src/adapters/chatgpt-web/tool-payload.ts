function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isChatGptSearchToolPayload(text: string): boolean {
  let value: unknown;
  try {
    value = JSON.parse(text.trim()) as unknown;
  } catch {
    return false;
  }
  if (!isRecord(value) || typeof value.response_length !== "string") return false;
  return Object.entries(value).some(([key, query]) => (
    /(?:^|_)search_query$/.test(key) && Array.isArray(query)
  ));
}
