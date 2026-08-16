import { get_encoding, type Tiktoken } from "tiktoken";
import { CHATGPT_WEB_PLATFORM_RESERVE_TOKENS } from "#runtime/providers/chatgpt-web/models/models";
import type { CompiledChatGptWebPrompt } from "#runtime/providers/chatgpt-web/content/prompt";

/** Token accounting for ChatGPT Web prompts. */
const TOKENIZER_CHUNK_CHARS = 4_096;
let tokenizer: Tiktoken | undefined;

function chatGptTokenizer(): Tiktoken {
  tokenizer ??= get_encoding("o200k_base");
  return tokenizer;
}

/** Count ordinary text conservatively in bounded tokenizer chunks. */
export function estimateTokens(text: string, modelId?: string): number {
  void modelId;
  if (!text) return 0;

  const encoding = chatGptTokenizer();
  let count = 0;
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + TOKENIZER_CHUNK_CHARS, text.length);
    if (end < text.length) {
      const previous = text.charCodeAt(end - 1);
      const next = text.charCodeAt(end);
      if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) {
        end -= 1;
      }
    }
    count += encoding.encode_ordinary(text.slice(start, end)).length;
    start = end;
  }
  return count;
}

// ChatGPT's product system prompt and the fixed Codex Native MCP schemas are not present in the
// visible composer text. Reserve them explicitly; over-counting fails safe by compacting earlier.
const CHATGPT_IMAGE_RESERVE_TOKENS = 4_096;
const CHATGPT_ORIGINAL_IMAGE_RESERVE_TOKENS = 8_192;

/** Tokens present in the one visible browser message, excluding hidden product/tool reserves. */
export function estimateCompiledChatGptWebMessageTokens(
  compiled: CompiledChatGptWebPrompt,
  modelId: string,
): number {
  return estimateTokens(compiled.text, modelId);
}

export function estimateCompiledChatGptWebInputTokens(
  compiled: CompiledChatGptWebPrompt,
  modelId: string,
): number {
  const imageTokens = compiled.images.reduce(
    (total, image) => total + (image.detail === "original"
      ? CHATGPT_ORIGINAL_IMAGE_RESERVE_TOKENS
      : CHATGPT_IMAGE_RESERVE_TOKENS),
    0,
  );
  return CHATGPT_WEB_PLATFORM_RESERVE_TOKENS
    + estimateCompiledChatGptWebMessageTokens(compiled, modelId)
    + imageTokens;
}
