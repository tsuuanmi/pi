import type { ParsedRequest } from "#runtime/core/protocol/types";

export interface ChatGptWebParsedRequest extends ParsedRequest {
  _rawBody?: unknown;
  /** Number of leading raw input items restored from local previous_response_id state. */
  _replayPrefixLen?: number;
  /** True when the proxy expanded a previous_response_id request into a full input replay. */
  _previousResponseInputExpanded?: boolean;
  /** Hosted web-search configuration converted into the ChatGPT synthetic search tool. */
  _webSearch?: Record<string, unknown>;
  /** Whether tool results must remain schema-safe for structured output. */
  _structuredOutput?: boolean;
  /** Whether this turn must emit a synthetic Responses compaction item. */
  _compactionRequest?: boolean;
  /** Whether this request introduced a new stored compaction boundary. */
  _contextCompactionBoundary?: boolean;
  /** Whether the request contains provider-private MultiAgent V2 encrypted content. */
  _opaqueMultiAgentV2Payload?: boolean;
}
