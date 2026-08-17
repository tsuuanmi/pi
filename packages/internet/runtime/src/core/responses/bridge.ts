import { randomUUID } from "node:crypto";
import type { AdapterEvent, ProviderContinuationState, Usage } from "#runtime/core/protocol/types";

export interface ResponsesBridgeOptions {
  responseId?: string;
  previousResponseId?: string;
  instructions?: string;
}

interface ResponseParts {
  text: string;
  usage?: Usage;
  providerState?: ProviderContinuationState;
  status: "in_progress" | "completed" | "incomplete" | "failed";
  incompleteDetails?: { reason: string };
  error?: { message: string; type: string; code: string | null };
}

function responseId(options: ResponsesBridgeOptions): string {
  return options.responseId ?? `resp_${randomUUID().replaceAll("-", "")}`;
}

function responseEnvelope(
  id: string,
  model: string,
  parts: ResponseParts,
  options: ResponsesBridgeOptions,
): Record<string, unknown> {
  const messageId = `msg_${id.slice(5)}`;
  const output = parts.status === "failed" || !parts.text
    ? []
    : [{
        type: "message",
        id: messageId,
        status: parts.status,
        role: "assistant",
        content: [{ type: "output_text", text: parts.text, annotations: [] }],
      }];
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: parts.status,
    ...(options.previousResponseId ? { previous_response_id: options.previousResponseId } : {}),
    model,
    output,
    ...(parts.incompleteDetails ? { incomplete_details: parts.incompleteDetails } : {}),
    usage: parts.usage
      ? {
          input_tokens: parts.usage.inputTokens,
          output_tokens: parts.usage.outputTokens,
          total_tokens: parts.usage.totalTokens ?? parts.usage.inputTokens + parts.usage.outputTokens,
          input_tokens_details: parts.usage.cachedInputTokens === undefined
            ? { cached_tokens: 0 }
            : { cached_tokens: parts.usage.cachedInputTokens },
          output_tokens_details: { reasoning_tokens: parts.usage.reasoningOutputTokens ?? 0 },
        }
      : null,
    ...(parts.error ? { error: parts.error } : {}),
  };
}

function collectParts(events: readonly AdapterEvent[]): ResponseParts {
  let text = "";
  let usage: Usage | undefined;
  let providerState: ProviderContinuationState | undefined;
  let status: ResponseParts["status"] = "completed";
  let incompleteDetails: { reason: string } | undefined;
  let error: ResponseParts["error"];
  for (const event of events) {
    if (event.type === "text_delta") text += event.text;
    else if (event.type === "done") {
      usage = event.usage;
      providerState = event.providerState;
    } else if (event.type === "incomplete") {
      status = "incomplete";
      usage = event.usage;
      providerState = event.providerState;
      incompleteDetails = { reason: event.reason };
    } else if (event.type === "error") {
      status = "failed";
      usage = event.usage;
      error = { message: event.message, type: event.errorType ?? "server_error", code: event.code ?? null };
    }
  }
  return { text, usage, providerState, status, incompleteDetails, error };
}

export async function buildResponsesJson(
  events: AsyncIterable<AdapterEvent>,
  model: string,
  options: ResponsesBridgeOptions = {},
): Promise<Record<string, unknown>> {
  const collected: AdapterEvent[] = [];
  for await (const event of events) collected.push(event);
  return responseEnvelope(responseId(options), model, collectParts(collected), options);
}

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function responsesSse(
  events: AsyncIterable<AdapterEvent>,
  model: string,
  options: ResponsesBridgeOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const id = responseId(options);
  const messageId = `msg_${id.slice(5)}`;
  let text = "";
  return new ReadableStream({
    async start(controller) {
      let sequenceNumber = 0;
      const write = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(event, { ...data, sequence_number: sequenceNumber })));
        sequenceNumber += 1;
      };
      try {
        write("response.created", { type: "response.created", response: responseEnvelope(id, model, { status: "in_progress", text: "" }, options) });
        write("response.output_item.added", {
          type: "response.output_item.added",
          output_index: 0,
          item: { type: "message", id: messageId, status: "in_progress", role: "assistant", content: [] },
        });
        write("response.content_part.added", {
          type: "response.content_part.added",
          item_id: messageId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
        });
        let terminal: AdapterEvent | undefined;
        for await (const event of events) {
          if (event.type === "text_delta") {
            text += event.text;
            write("response.output_text.delta", {
              type: "response.output_text.delta", item_id: messageId, output_index: 0, content_index: 0, delta: event.text,
            });
          } else if (event.type === "done" || event.type === "incomplete" || event.type === "error") {
            terminal = event;
            break;
          }
        }
        const parts = collectParts([
          ...(text ? [{ type: "text_delta", text } satisfies AdapterEvent] : []),
          ...(terminal ? [terminal] : []),
        ]);
        if (parts.status !== "failed") {
          write("response.output_text.done", { type: "response.output_text.done", item_id: messageId, output_index: 0, content_index: 0, text });
          write("response.content_part.done", {
            type: "response.content_part.done", item_id: messageId, output_index: 0, content_index: 0,
            part: { type: "output_text", text, annotations: [] },
          });
          write("response.output_item.done", {
            type: "response.output_item.done", output_index: 0,
            item: { type: "message", id: messageId, status: parts.status, role: "assistant", content: [{ type: "output_text", text, annotations: [] }] },
          });
        }
        const response = responseEnvelope(id, model, parts, options);
        write(parts.status === "completed" ? "response.completed" : parts.status === "incomplete" ? "response.incomplete" : "response.failed", {
          type: parts.status === "completed" ? "response.completed" : parts.status === "incomplete" ? "response.incomplete" : "response.failed",
          response,
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        write("response.failed", {
          type: "response.failed",
          response: responseEnvelope(id, model, {
            status: "failed", text: "", error: { message: error instanceof Error ? error.message : String(error), type: "server_error", code: null },
          }, options),
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
    cancel() {
      void events[Symbol.asyncIterator]().return?.();
    },
  });
}
