function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function contentText(content: unknown): string | undefined {
  if (typeof content === "string") return content.trim() || undefined;
  if (!isRecord(content)) return undefined;
  if (typeof content.text === "string") return content.text.trim() || undefined;
  if (Array.isArray(content.parts)) {
    const text = content.parts.filter((part): part is string => typeof part === "string").join("\n").trim();
    if (text) return text;
  }
  return undefined;
}

function assistantTexts(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) assistantTexts(entry, output);
    return;
  }
  if (!isRecord(value)) return;
  const author = isRecord(value.author) ? value.author.role : undefined;
  if (value.role === "assistant" || author === "assistant") {
    const text = contentText(value.content);
    if (text) output.push(text);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "content" && key !== "author" && key !== "metadata") assistantTexts(child, output);
  }
}

function payloads(body: string): unknown[] {
  const dataLines = body
    .split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trim())
    .filter(data => data && data !== "[DONE]");
  const serialized = dataLines.length > 0 ? dataLines : [body.trim()];
  return serialized.flatMap(data => {
    try {
      return [JSON.parse(data) as unknown];
    } catch {
      return [];
    }
  });
}

export function parseChatGptWireResponse(body: string): string | undefined {
  const candidates: string[] = [];
  const appended: string[] = [];
  for (const payload of payloads(body)) {
    assistantTexts(payload, candidates);
    if (isRecord(payload) && (payload.type === "append" || payload.o === "append")) {
      const path = payload.path ?? payload.p;
      const value = payload.value ?? payload.v;
      if (typeof path === "string" && /(?:content|parts|text)/i.test(path) && typeof value === "string") {
        appended.push(value);
      }
    }
  }
  return candidates.at(-1) ?? (appended.join("").trim() || undefined);
}
