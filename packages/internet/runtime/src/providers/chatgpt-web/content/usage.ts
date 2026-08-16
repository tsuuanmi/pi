import type { ParsedRequest, Usage } from "#runtime/providers/chatgpt-web/protocol/types";
import { estimateCompiledChatGptWebInputTokens, estimateTokens } from "#runtime/providers/chatgpt-web/content/tokens";
import { compileChatGptWebPrompt } from "#runtime/providers/chatgpt-web/content/prompt";
import { resolveChatGptWebModelMode, type ChatGptWebCapabilities } from "#runtime/providers/chatgpt-web/models/model";
import type { BrokerToolRequest } from "#runtime/providers/chatgpt-web/turn/broker";

// The real capability has the same length. Keeping it out of usage accounting would make
// estimates differ slightly between the prepared browser prompt and later Codex tool rounds.
const ESTIMATE_TURN_TOKEN = "turn_00000000000000000000000000000000";

export interface ChatGptWebRoundEvidence {
  answer?: string;
  reasoning?: string[];
  toolRequests?: BrokerToolRequest[];
}

export function usageDisplayTotalTokens(usage: Usage | undefined): number | undefined {
  if (!usage) return undefined;
  const baseTotal = usage.inputTokens + usage.outputTokens;
  const explicitTotal = usage.totalTokens;
  return typeof explicitTotal === "number" ? Math.max(explicitTotal, baseTotal) : baseTotal;
}

function conservativeTextTokens(text: string, modelId: string): number {
  return estimateTokens(text, modelId);
}

export function estimateChatGptWebInputTokens(
  parsed: ParsedRequest,
  capabilities: ChatGptWebCapabilities,
): number {
  const mode = resolveChatGptWebModelMode(parsed.modelId, parsed.options.reasoning, capabilities);
  const compiled = compileChatGptWebPrompt(
    parsed,
    capabilities,
    mode.localTools ? ESTIMATE_TURN_TOKEN : undefined,
  );
  return estimateCompiledChatGptWebInputTokens(compiled, parsed.modelId);
}

function roundEvidenceText(evidence: ChatGptWebRoundEvidence): string {
  return JSON.stringify({
    reasoning: evidence.reasoning ?? [],
    ...(evidence.answer !== undefined ? { answer: evidence.answer } : {}),
    ...(evidence.toolRequests ? {
      tool_calls: evidence.toolRequests.map(request => ({
        call_id: request.callId,
        name: request.wireName,
        ...(request.freeform
          ? { input: request.input ?? "" }
          : { arguments: request.arguments ?? {} }),
      })),
    } : {}),
  });
}

export function estimateChatGptWebUsage(
  parsed: ParsedRequest,
  evidence: ChatGptWebRoundEvidence,
  capabilities: ChatGptWebCapabilities,
): Usage {
  const inputTokens = estimateChatGptWebInputTokens(parsed, capabilities);
  const outputTokens = conservativeTextTokens(roundEvidenceText(evidence), parsed.modelId);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimated: true,
  };
}
